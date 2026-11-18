const mongoose = require('mongoose');

const FOLDERS = ['Signed Documents', 'ID & Address Proofs', 'Certificates', 'Non-Disclosure Agreements', 'Uploads'];

// Employee documents. Files up to 5 MB are stored in MongoDB (no extra storage service needed).
const documentSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    folder: { type: String, enum: FOLDERS, default: 'Uploads' },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    data: { type: Buffer, select: false },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
module.exports.FOLDERS = FOLDERS;
