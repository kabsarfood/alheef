require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const apiRoutes = require('./server/routes/api');
const adminRoutes = require('./server/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');

[dataDir, uploadsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(uploadsDir));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/config', (_req, res) => {
  res.json({
    whatsapp: process.env.WHATSAPP_NUMBER || '966500000000',
    phone: process.env.PHONE_DISPLAY || '050 000 0000',
    instagram: process.env.INSTAGRAM_URL || '#',
    x: process.env.X_URL || '#',
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/dashboard')) {
    const page = req.path === '/dashboard' || req.path === '/dashboard/'
      ? 'index.html'
      : req.path.replace('/dashboard/', '');
    const filePath = path.join(__dirname, 'dashboard', page);
    if (fs.existsSync(filePath) && filePath.endsWith('.html')) {
      return res.sendFile(filePath);
    }
    return res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
});

app.listen(PORT, () => {
  console.log(`الهيف — الخادم يعمل على http://localhost:${PORT}`);
});
