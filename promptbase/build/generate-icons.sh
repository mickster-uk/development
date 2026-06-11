#!/bin/bash

# Icon generation script for Promptbase using macOS sips tool
# Usage: ./build/generate-icons.sh <source-image-path>

if [ -z "$1" ]; then
    echo "Usage: ./build/generate-icons.sh <source-image-path>"
    echo "Example: ./build/generate-icons.sh ~/Downloads/avatar.png"
    exit 1
fi

SOURCE_IMAGE="$1"
OUTPUT_DIR="$(dirname "$0")/icons"

if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Error: File not found: $SOURCE_IMAGE"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Array of sizes needed
declare -a sizes=("16" "32" "64" "128" "256" "512")

echo "Generating icons from: $SOURCE_IMAGE"
echo "Output directory: $OUTPUT_DIR"
echo ""

for size in "${sizes[@]}"; do
    output_file="$OUTPUT_DIR/icon-${size}.png"
    echo "Generating ${size}x${size}..."
    sips -z "$size" "$size" "$SOURCE_IMAGE" --out "$output_file"
    if [ $? -eq 0 ]; then
        echo "  ✓ Created icon-${size}.png"
    else
        echo "  ✗ Failed to create icon-${size}.png"
        exit 1
    fi
done

echo ""
echo "✓ All PNG icons generated successfully!"
echo ""
echo "Next steps for other platforms:"
echo "  1. macOS (.icns): Convert icon-512.png at https://icoconvert.com/"
echo "  2. Windows (.ico): Convert icon-512.png at https://convertio.co/png-ico/"
echo "  3. Save both icon.icns and icon.ico to build/icons/"
