# paddle_ocr.py
import sys
from paddleocr import PaddleOCR

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 paddle_ocr.py <image_path>", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]

    try:
        # Initialize PaddleOCR with logs enabled for debugging
        ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False, show_log=True)
        result = ocr.ocr(image_path, cls=True)

        if not result or not result[0]:
            print("No text extracted from the image")
            sys.exit(0)

        # Extract text only
        extracted_text = ""
        for line in result[0]:
            text = line[1][0]  # Text only
            extracted_text += text + "\n"

        # Output only the raw text for Node.js
        print(extracted_text.strip())
    except Exception as e:
        print(f"Error in PaddleOCR: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()