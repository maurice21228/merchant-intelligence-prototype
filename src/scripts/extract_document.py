import json
import pathlib
import sys

from docx import Document
from pypdf import PdfReader


def extract_text(path: pathlib.Path) -> str:
    suffix = path.suffix.lower()

    if suffix in {".txt", ".md"}:
        return path.read_text(encoding="utf-8", errors="ignore")

    if suffix == ".docx":
        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    if suffix == ".pdf":
        reader = PdfReader(str(path))
        pages = []
        for page in reader.pages:
            pages.append(page.extract_text() or "")
        return "\n".join(part for part in pages if part.strip())

    raise ValueError(f"Unsupported file type: {suffix}")


def main() -> None:
    if len(sys.argv) != 2:
        raise ValueError("Expected a single file path argument")

    path = pathlib.Path(sys.argv[1])
    text = extract_text(path)
    print(json.dumps({"text": text}))


if __name__ == "__main__":
    main()
