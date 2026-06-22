#!/bin/bash
# 下载 TensorFlow.js AI 模型到本地
# 用法: bash scripts/download-models.sh

set -e

MODELS_DIR="public/models"
BASE_URL="https://tfhub.dev/google/tfjs-model"

echo "📦 开始下载 AI 模型..."

# MoveNet Lightning (人体姿态检测)
echo "  ⬇️  MoveNet Thunder..."
mkdir -p $MODELS_DIR/movenet
curl -sL "https://tfhub.dev/google/tfjs-model/movenet/singlepose/thunder/4?tfjs-format=file" -o $MODELS_DIR/movenet/model.json

# Selfie Segmentation (人体分割)
echo "  ⬇️  Selfie Segmentation..."
mkdir -p $MODELS_DIR/selfie_segmentation
curl -sL "https://tfhub.dev/google/tfjs-model/selfie_segmentation/general/2?tfjs-format=file" -o $MODELS_DIR/selfie_segmentation/model.json

# Face Detection (面部检测)
echo "  ⬇️  Face Detection..."
mkdir -p $MODELS_DIR/face_detector
curl -sL "https://tfhub.dev/mediapipe/tfjs-model/face_detection/short/1?tfjs-format=file" -o $MODELS_DIR/face_detector/model.json

# Face Landmark (面部网格)
echo "  ⬇️  Face Landmark..."
mkdir -p $MODELS_DIR/face_landmark
curl -sL "https://tfhub.dev/mediapipe/tfjs-model/face_landmark_detection/1?tfjs-format=file" -o $MODELS_DIR/face_landmark/model.json

# Hand Detection (手部检测)
echo "  ⬇️  Hand Detection..."
mkdir -p $MODELS_DIR/hand_detector
curl -sL "https://tfhub.dev/mediapipe/tfjs-model/hand_detection/1?tfjs-format=file" -o $MODELS_DIR/hand_detector/model.json

# Hand Landmark (手部网格)
echo "  ⬇️  Hand Landmark..."
mkdir -p $MODELS_DIR/hand_landmark
curl -sL "https://tfhub.dev/mediapipe/tfjs-model/hand_landmark_detection/1?tfjs-format=file" -o $MODELS_DIR/hand_landmark/model.json

echo ""
echo "✅ 所有模型下载完成！"
echo "📁 模型位置: $MODELS_DIR/"
ls -la $MODELS_DIR/
