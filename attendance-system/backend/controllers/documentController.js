const Document = require('../models/Document');
const { FOLDERS } = require('../models/Document');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');

const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp)|application\/(msword|vnd\.openxmlformats-officedocument\..+|vnd\.ms-excel)|text\/plain)$/;

// GET /api/employees/:id/documents  (admin)
exports.list = asyncHandler(async (req, res) => {
  const items = await Document.find({ employee: req.params.id }).sort({ createdAt: -1 }).populate('uploadedBy', 'name');
  res.json({ folders: FOLDERS, items });
});

// POST /api/employees/:id/documents  multipart: file, folder  (admin)
exports.upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a file to upload');
  if (!ALLOWED.test(req.file.mimetype)) throw new HttpError(400, 'Allowed: PDF, images, Word, Excel or text files');
  const folder = FOLDERS.includes(req.body.folder) ? req.body.folder : 'Uploads';
  const doc = await Document.create({
    employee: req.params.id,
    folder,
    name: req.file.originalname.slice(0, 200),
    mimeType: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer,
    uploadedBy: req.user._id,
  });
  res.status(201).json({ _id: doc._id, name: doc.name, folder: doc.folder, size: doc.size, createdAt: doc.createdAt });
});

// GET /api/documents/:id/download  (admin)
exports.download = asyncHandler(async (req, res) => {
  const doc = await Document.findById(req.params.id).select('+data');
  if (!doc) throw new HttpError(404, 'Document not found');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
  res.send(doc.data);
});

// DELETE /api/documents/:id  (admin)
exports.remove = asyncHandler(async (req, res) => {
  const doc = await Document.findByIdAndDelete(req.params.id);
  if (!doc) throw new HttpError(404, 'Document not found');
  res.json({ message: 'Document deleted' });
});
