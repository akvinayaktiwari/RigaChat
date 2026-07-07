#!/bin/bash
echo "Installing AWS CLI..."
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" \
  -o "/tmp/AWSCLIV2.pkg"
sudo installer -pkg /tmp/AWSCLIV2.pkg -target /
echo "AWS CLI installed successfully"
aws --version
echo ""
echo "Now configure your credentials:"
echo "Run: aws configure"
echo ""
echo "You will need:"
echo "  AWS Access Key ID: from AWS Console → Security credentials"
echo "  AWS Secret Access Key: from same place"
echo "  Default region: ap-south-1"
echo "  Default output format: json"
