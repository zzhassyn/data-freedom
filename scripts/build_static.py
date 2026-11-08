"""Publish the browser assets to Vercel's CDN without starting Python or Turso."""
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web'
OUTPUT = ROOT / 'public'


def main():
    # public/ is generated build output. Never follow a link outside this checkout.
    target = OUTPUT.resolve()
    if target.parent != ROOT or target.name != 'public' or OUTPUT.is_symlink():
        raise RuntimeError('Unexpected static build output directory')
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()

    files = [SOURCE / 'index.html', SOURCE / 'favicon.svg']
    files += sorted((SOURCE / 'js').glob('*.js'))
    files += sorted((SOURCE / 'styles').glob('*.css'))
    files += sorted((SOURCE / 'assets').glob('*.svg'))
    for source in files:
        if not source.is_file() or source.is_symlink() or not source.resolve().is_relative_to(SOURCE):
            raise RuntimeError('Unexpected browser asset')
        destination = OUTPUT / source.relative_to(SOURCE)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    print(f'Published {len(files)} unchanged browser assets to public/; API and data are excluded.')


if __name__ == '__main__':
    main()
