import sys
from paddleocr import PaddleOCR
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("paddle_ocr")

def process_image(image_path):
    try:
        # Initialize PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='en')
        
        # Perform OCR
        result = ocr.ocr(image_path, cls=True)
        
        if not result or not result[0]:
            logger.warning("No text detected in the image")
            return ""
        
        # Extract and format text
        extracted_text = []
        for line in result[0]:
            text = line[1][0]  # Get the text content
            confidence = line[1][1]  # Get the confidence score
            if confidence > 0.8:  # Only include high-confidence results
                extracted_text.append(text)
        
        return "\n".join(extracted_text)
        
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        return f"Error: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python paddle_ocr.py <image_path>")
        sys.exit(1)
        
    image_path = sys.argv[1]
    result = process_image(image_path)
    print(result) 