console.log('### IOT ROUTER VERSION 2026 ###');

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nunjucks = require('nunjucks');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, 'uploaded');
const TEMPLATE_DIR = path.join(__dirname, 'templates');

// Pastikan folder upload ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Nunjucks khusus module IoT
const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(TEMPLATE_DIR, {
    noCache: true
  }),
  {
    autoescape: true
  }
);

// Parser untuk form Delete
router.use(express.urlencoded({ extended: true }));

// Static file
router.use('/uploaded', express.static(UPLOAD_DIR));

function render(res, template, data = {}) {
  try {
    const html = env.render(template, data);
    return res.send(html);
  } catch (err) {
    console.error('TEMPLATE ERROR:', err);
    return res.status(500).send('Template rendering failed');
  }
}

function getMime(filename) {
  const ext = path.extname(filename).toLowerCase();

  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf'
  };

  return mimeMap[ext] || 'application/octet-stream';
}

function sanitizeFilename(filename) {
  return path
    .basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ==============================
// MULTER
// ==============================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    const safeName = sanitizeFilename(file.originalname);
    cb(null, safeName);
  }
});

const upload = multer({
  storage: storage
});

// ==============================
// FILE LIST
// ==============================

router.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(name => {
        // Jangan tampilkan file Git placeholder
        if (name === '.gitkeep') {
          return false;
        }

        const fullpath = path.join(UPLOAD_DIR, name);

        return (
          fs.existsSync(fullpath) &&
          fs.statSync(fullpath).isFile()
        );
      })
      .map(name => {
        const fullpath = path.join(UPLOAD_DIR, name);
        const stat = fs.statSync(fullpath);
        const mime = getMime(name);

        return {
          name,
          size: `${stat.size} B`,
          mime,
          fullname: fullpath,
          visible:
            mime.startsWith('image/') ||
            mime.startsWith('text/')
        };
      })
      .sort((a, b) =>
        a.name
          .toLowerCase()
          .localeCompare(b.name.toLowerCase())
      );

    const baseUrl =
    req.baseUrl ||
    (req.originalUrl.startsWith('/iot') ? '/iot' : '');

    return render(res, 'index.html', {
      files,
      folders: [],
      base_url: baseUrl,
      meta: {
        current_directory: UPLOAD_DIR
      }
    });

  } catch (err) {
    console.error('FILE LIST ERROR:', err);

    return res
      .status(500)
      .send('Failed to read upload directory');
  }
});

// ==============================
// DOWNLOAD
// ==============================

router.get('/download', (req, res) => {
  const filename = req.query.filename;

  if (!filename) {
    return render(res, 'not_found.html');
  }

  const resolved = path.resolve(filename);
  const uploadResolved = path.resolve(UPLOAD_DIR);

  if (!fs.existsSync(resolved)) {
    return render(res, 'not_found.html');
  }

  // Hanya file langsung di uploaded/
  if (path.dirname(resolved) !== uploadResolved) {
    return render(res, 'no_permission.html');
  }

  return res.download(resolved);
});

// ==============================
// IMAGE / TEXT VIEW
// ==============================

router.get('/imageview', (req, res) => {
  const filename = req.query.filename;
  const rotate = parseInt(req.query.rotate || '0', 10);

  if (!filename) {
    return render(res, 'not_found.html');
  }

  const resolved = path.resolve(filename);
  const uploadResolved = path.resolve(UPLOAD_DIR);

  if (!fs.existsSync(resolved)) {
    return render(res, 'not_found.html');
  }

  if (path.dirname(resolved) !== uploadResolved) {
    return render(res, 'no_permission.html');
  }

  const mime = getMime(resolved);

  if (mime.startsWith('image/')) {
    return render(res, 'view.html', {
      user_image:
        `${req.baseUrl}/uploaded/${encodeURIComponent(
          path.basename(resolved)
        )}`,
      rotate
    });
  }

  if (mime.startsWith('text/')) {
    const contents = fs.readFileSync(
      resolved,
      'utf8'
    );

    const escaped = contents
      .split('\n')
      .map(line =>
        line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      )
      .join('<br>');

    return res.send(escaped);
  }

  return render(res, 'no_permission.html');
});

// ==============================
// MULTIPART UPLOAD
// ==============================

router.post('/upload_multipart', (req, res) => {

  upload.single('upfile')(req, res, (err) => {

    if (err) {
      console.error('MULTER ERROR:', err);

      return res.status(500).json({
        result: 'upload FAIL',
        error: err.message
      });
    }

    if (!req.file) {
      console.error('NO FILE RECEIVED');

      return res.status(400).json({
        result: 'upload FAIL',
        error: 'No file received'
      });
    }

    console.log('UPLOAD OK');
    console.log('Original filename:', req.file.originalname);
    console.log('Saved filename:', req.file.filename);
    console.log('Saved path:', req.file.path);
    console.log('File size:', req.file.size);

    return res.status(200).json({
      result: 'upload OK',
      filename: req.file.filename,
      size: req.file.size
    });

  });

});

// ==============================
// DELETE
// ==============================

router.post('/delete', (req, res) => {
  const filename = req.body.filename;

  if (!filename) {
    return res
      .status(400)
      .send('Filename is required');
  }

  const resolved = path.resolve(filename);
  const uploadResolved = path.resolve(UPLOAD_DIR);

  if (path.dirname(resolved) !== uploadResolved) {
    return res
      .status(403)
      .send(
        env.render('no_permission.html')
      );
  }

  if (!fs.existsSync(resolved)) {
    return res
      .status(404)
      .send(
        env.render('not_found.html')
      );
  }

  try {
    fs.unlinkSync(resolved);

    console.log(`Deleted: ${resolved}`);

    return res.redirect(
      req.baseUrl || '/'
    );

  } catch (err) {
    console.error('DELETE ERROR:', err);

    return res
      .status(500)
      .send('Failed to delete file');
  }
});

module.exports = router;