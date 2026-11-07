"""Validate every audio destination, then connect only to a checked IP address."""
import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import httpx


def audio_destination(url, allowed_hosts):
    """Syntax/allowlist check without network I/O (also used during import)."""
    if not isinstance(url, str) or any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise ValueError('Invalid audio URL')
    parsed = urlsplit(url)
    host = (parsed.hostname or '').rstrip('.').lower()
    if parsed.scheme != 'https' or not host or parsed.username is not None or parsed.password is not None:
        raise ValueError('Audio requires an HTTPS host without credentials')
    suffixes = (suffix.strip().strip('.').lower() for suffix in allowed_hosts)
    if not any(suffix and (host == suffix or host.endswith('.' + suffix)) for suffix in suffixes):
        raise ValueError('Audio host is not allowed')
    port = parsed.port if parsed.port is not None else 443
    if not 1 <= port <= 65535:
        raise ValueError('Invalid audio port')
    return host, port


def public_address(value):
    if '%' in value:
        return False
    address = ipaddress.ip_address(value)
    mapped = getattr(address, 'ipv4_mapped', None)
    if mapped is not None:
        address = mapped
    return (address.is_global and not any((address.is_loopback, address.is_private,
            address.is_link_local, address.is_multicast, address.is_unspecified, address.is_reserved)))


async def resolve_audio_destination(url, allowed_hosts):
    host, port = audio_destination(url, allowed_hosts)
    answers = await asyncio.wait_for(asyncio.to_thread(
        socket.getaddrinfo, host, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP), timeout=10)
    addresses = []
    for family, _, _, _, sockaddr in answers:
        if family not in (socket.AF_INET, socket.AF_INET6) or not public_address(sockaddr[0]):
            raise ValueError('Audio host resolved to a non-public address')
        if sockaddr[0] not in addresses:
            addresses.append(sockaddr[0])
    if not addresses:
        raise ValueError('Audio host has no public addresses')
    return host, addresses


async def audio_get(client, url, allowed_hosts, headers=None):
    """Follow at most three redirects, validating and pinning every connection.

    Keep the original Host and TLS SNI/certificate hostname while using a checked
    IP in the connection URL. A second DNS lookup cannot redirect the connection
    to an internal address (DNS rebinding). Callers must disable proxy environment
    variables and keepalive across origins when creating the client.
    """
    for redirects in range(4):
        host, addresses = await resolve_audio_destination(url, allowed_hosts)
        # Preserve the signed path/query verbatim; canonicalize only the host.
        logical_url = httpx.URL(url).copy_with(host=host)
        response = None
        for address in addresses:
            request = client.build_request('GET', logical_url, headers=headers)
            request.url = request.url.copy_with(host=address)
            request.extensions['sni_hostname'] = host
            try:
                response = await client.send(request, stream=True, follow_redirects=False)
                break
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if address == addresses[-1]:
                    raise
        if response.status_code not in {301, 302, 303, 307, 308}:
            return response, str(logical_url)
        location = response.headers.get('location')
        await response.aclose()
        if redirects == 3 or not location:
            raise ValueError('Audio redirect limit exceeded or Location is absent')
        url = urljoin(str(logical_url), location)
    raise ValueError('Audio redirect limit exceeded')
