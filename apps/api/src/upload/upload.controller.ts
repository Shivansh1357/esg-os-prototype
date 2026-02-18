import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import * as crypto from 'crypto';
import { requireRole } from '../rbac/access';

const s3 = new S3Client({
  region: 'us-east-1',
  forcePathStyle: true,
  endpoint: process.env.S3_ENDPOINT,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! }
});

type UploadReq = { filename: string; contentType: string; sha256?: string };
type UploadRes = {
  s3Key: string;
  hash: string | null;
  meta: { bucket: string; contentType: string; maxSize: number };
  post: { url: string; fields: Record<string, string> };
};

@Controller()
export class UploadController {
  @Post('/upload')
  async presign(@Body() body: UploadReq): Promise<UploadRes> {
    requireRole('ADMIN', 'MEMBER');
    if (!body?.filename || !body?.contentType) {
      throw new BadRequestException('filename and contentType required');
    }
    const bucket = process.env.S3_BUCKET || 'mock-bucket';
    const maxSize = 25 * 1024 * 1024; // 25MB
    const ext = body.filename.split('.').pop() || 'bin';
    const key = `uploads/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

    const hasS3 =
      !!process.env.S3_BUCKET &&
      !!process.env.S3_ENDPOINT &&
      !!process.env.S3_ACCESS_KEY &&
      !!process.env.S3_SECRET_KEY;

    if (!hasS3) {
      return {
        s3Key: key,
        hash: body.sha256 ?? null,
        meta: { bucket, contentType: body.contentType, maxSize },
        post: { url: 'mock://upload', fields: {} }
      };
    }

    const { url, fields } = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, maxSize],
        ['eq', '$Content-Type', body.contentType],
        ['eq', '$acl', 'private']
      ],
      Fields: { 'Content-Type': body.contentType, acl: 'private' },
      Expires: 300
    });

    return {
      s3Key: key,
      hash: body.sha256 ?? null,
      meta: { bucket, contentType: body.contentType, maxSize },
      post: { url, fields }
    };
  }
}


