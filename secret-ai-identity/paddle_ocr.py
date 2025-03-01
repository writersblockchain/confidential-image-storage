from paddleocr import PaddleOCR
import sys

def extract_text(image_path):
    try:
        # Initialize PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='en')
        
        # Read the image and extract text
        result = ocr.ocr(image_path, cls=True)
        
        # Process results
        extracted_text = []
        for line in result:
            for word_info in line:
                text = word_info[1][0]  # Get the text
                confidence = word_info[1][1]  # Get the confidence score
                extracted_text.append(text)
        
        # Join all extracted text with newlines
        return '\n'.join(extracted_text)
    except Exception as e:
        print(f"Error during OCR: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python paddle_ocr.py <image_path>", file=sys.stderr)
        sys.exit(1)
    
    image_path = sys.argv[1]
    text = extract_text(image_path)
    print(text) 