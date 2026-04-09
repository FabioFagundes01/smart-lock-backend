#!/usr/bin/env python3
"""
Face recognition worker.
Usage:
  Extract descriptor:  python3 face-worker.py extract <image_path>
  Compare faces:       python3 face-worker.py compare <image_path> <json_descriptors_file>

Output: JSON to stdout
"""
import sys
import json
import face_recognition
import numpy as np


def extract(image_path: str):
    """Extract face descriptor from an image."""
    try:
        image = face_recognition.load_image_file(image_path)
    except Exception as e:
        print(json.dumps({"error": f"Cannot load image: {e}"}))
        sys.exit(1)

    encodings = face_recognition.face_encodings(image)
    if not encodings:
        print(json.dumps({"error": "No face detected"}))
        sys.exit(1)

    descriptor = encodings[0].tolist()
    print(json.dumps({"descriptor": descriptor, "count": len(encodings)}))


def compare(image_path: str, descriptors_file: str):
    """Compare a face against a list of known descriptors."""
    try:
        image = face_recognition.load_image_file(image_path)
    except Exception as e:
        print(json.dumps({"error": f"Cannot load image: {e}"}))
        sys.exit(1)

    encodings = face_recognition.face_encodings(image)
    if not encodings:
        print(json.dumps({"matched": False, "error": "No face detected"}))
        sys.exit(0)

    unknown_encoding = encodings[0]

    with open(descriptors_file, "r") as f:
        known = json.load(f)  # [{"userId": "...", "descriptor": [...]}]

    if not known:
        print(json.dumps({"matched": False, "error": "No known faces"}))
        sys.exit(0)

    known_encodings = [np.array(k["descriptor"]) for k in known]
    known_ids = [k["userId"] for k in known]

    distances = face_recognition.face_distance(known_encodings, unknown_encoding)
    best_idx = int(np.argmin(distances))
    best_distance = float(distances[best_idx])
    threshold = 0.6

    if best_distance < threshold:
        confidence = max(0, 1 - best_distance / threshold)
        print(json.dumps({
            "matched": True,
            "userId": known_ids[best_idx],
            "distance": round(best_distance, 4),
            "confidence": round(confidence, 4),
        }))
    else:
        print(json.dumps({
            "matched": False,
            "userId": None,
            "distance": round(best_distance, 4),
            "confidence": 0,
        }))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: face-worker.py <extract|compare> <args...>"}))
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "extract":
        extract(sys.argv[2])
    elif cmd == "compare":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "compare needs <image_path> <descriptors_file>"}))
            sys.exit(1)
        compare(sys.argv[2], sys.argv[3])
    else:
        print(json.dumps({"error": f"Unknown command: {cmd}"}))
        sys.exit(1)
