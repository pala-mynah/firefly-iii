"""Convert George CSV exports (UTF-16, semicolon, single-quoted) to UTF-8 for FIDI."""
import csv
import sys
from pathlib import Path


def convert(src: Path) -> Path:
    dst = src.with_stem(src.stem + "_utf8")
    with open(src, encoding="utf-16") as f_in, open(dst, "w", encoding="utf-8", newline="") as f_out:
        reader = csv.reader(f_in, delimiter=";", quotechar="'")
        writer = csv.writer(f_out)
        for row in reader:
            writer.writerow(row)
    print(f"Written: {dst}")
    return dst


if __name__ == "__main__":
    for path in sys.argv[1:]:
        convert(Path(path))
