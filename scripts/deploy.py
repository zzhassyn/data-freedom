"""Build the public asset upload before handing deployment to Vercel CLI."""
from contextlib import redirect_stdout
import shutil
import subprocess
import sys

from build_static import ROOT, main as build_static


def main():
    # Vercel selects public/**/* from uploaded inputs before Python builds run.
    # Always regenerate it here so deployments cannot upload stale browser files.
    with redirect_stdout(sys.stderr):
        build_static()
    cli = shutil.which('vercel')
    if not cli:
        raise SystemExit('Install Vercel CLI before deploying.')
    raise SystemExit(subprocess.call([cli, 'deploy', *sys.argv[1:]], cwd=ROOT))


if __name__ == '__main__':
    main()
