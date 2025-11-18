// Minimal Express server
import express from 'express';
import fetch from 'node-fetch';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractMediaFromInstagramPage } from './scraper.js';

dotenv.config();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(helmet());
app.use(express.json());
app.use(morgan('tiny'));

// Rate limit to reduce abuse for this demo
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint: POST /api/extract { url }
app.post('/api/extract', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url in JSON body' });

    // Very basic validation
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });

    // Only allow Instagram domains (basic)
    if (!/instagram\.com/i.test(url)) return res.status(400).json({ error: 'Only instagram.com URLs allowed' });

    const result = await extractMediaFromInstagramPage(url, process.env.USER_AGENT);
    if (!result) return res.status(404).json({ error: 'Media URL not found or post may be private' });

    return res.json({ media: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
