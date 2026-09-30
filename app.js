const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nunjucks = require('nunjucks');

const app = express();
const router = express.Router();
app.use(express.urlencoded({ extended: true }));

const UPLOAD_DIR = path.join(__dirname, 'uploaded');
const TEMPLATE_DIR = path.join(__dirname, 'templates');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

nunjucks.configure(TEMPLATE_DIR, {
  autoescape: true,
  express: app
});

app.set('view engine', 'html');

app.use('/uploaded', express.static(UPLOAD_DIR));
app.use('/iot/uploaded', express.static(UPLOAD_DIR));

function getMime(filename) {
  const ext = path.extname(filename).toLowerCase();

  const map = {
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

  return map[ext] || 'application/octet-stream';
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    const safeName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    cb(null, safeName);
  }
});

const upload = multer({ storage });

router.get('/', (req, res) => {
  const files = fs.readdirSync(UPLOAD_DIR)
    .filter(name => {
      return fs.statSync(path.join(UPLOAD_DIR, name)).isFile();
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
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

  res.render('index.html', {
    files,
    folders: [],
    meta: {
      current_directory: UPLOAD_DIR
    }
  });
});

router.get('/download', (req, res) => {
  const filename = req.query.filename;

  if (!filename) {
    return res.render('not_found.html');
  }

  const resolved = path.resolve(filename);
  const uploadResolved = path.resolve(UPLOAD_DIR);

  if (!fs.existsSync(resolved)) {
    return res.render('not_found.html');
  }

  if (path.dirname(resolved) !== uploadResolved) {
    return res.render('no_permission.html');
  }

  res.download(resolved);
});

router.get('/imageview', (req, res) => {
  const filename = req.query.filename;
  const rotate = parseInt(req.query.rotate || '0', 10);

  if (!filename) {
    return res.render('not_found.html');
  }

  const resolved = path.resolve(filename);
  const uploadResolved = path.resolve(UPLOAD_DIR);

  if (!fs.existsSync(resolved)) {
    return res.render('not_found.html');
  }

  if (path.dirname(resolved) !== uploadResolved) {
    return res.render('no_permission.html');
  }

  const mime = getMime(resolved);

  if (mime.startsWith('image/')) {
    return res.render('view.html', {
      user_image: `${req.baseUrl}/uploaded/${path.basename(resolved)}`,
      rotate
    });
  }

  if (mime.startsWith('text/')) {
    const contents = fs.readFileSync(resolved, 'utf8');

    return res.send(
      contents
        .split('\n')
        .map(line => line.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        .join('<br>')
    );
  }

  return res.render('no_permission.html');
});

router.post(
  '/upload_multipart',
  upload.single('upfile'),
  (req, res) => {
    console.log('upload_multipart');

    if (!req.file) {
      return res.status(400).json({
        result: 'upload FAIL'
      });
    }

    console.log(`Uploaded: ${req.file.originalname}`);
    console.log(`Saved as: ${req.file.path}`);

    res.json({
      result: 'upload OK'
    });
  }
);

router.post('/delete', (req, res) => {
  const filename = req.body.filename;

  if (!filename) {
    return res.status(400).send('Filename is required');
  }

  const resolved = path.resolve(filename);
  const uploadResolved = path.resolve(UPLOAD_DIR);

  // Pastikan hanya file langsung di folder uploaded yang boleh dihapus
  if (path.dirname(resolved) !== uploadResolved) {
    return res.status(403).render('no_permission.html');
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).render('not_found.html');
  }

  try {
    fs.unlinkSync(resolved);
    console.log(`Deleted: ${resolved}`);

    return res.redirect(req.baseUrl || '/');
  } catch (err) {
    console.error(err);
    return res.status(500).send('Failed to delete file');
  }
});

app.use('/', router);
app.use('/iot', router);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});