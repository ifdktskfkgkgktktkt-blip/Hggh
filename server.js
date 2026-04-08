require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://telegram-app-sepia-five.vercel.app', 'http://localhost:3000', '*'],
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 🔐 Функция валидации initData от Telegram
function validateInitData(initData, token) {
    try {
        if (!initData || !token) return false;
        
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return false;
        
        params.delete('hash');
        
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
            
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        return computedHash.toLowerCase() === hash.toLowerCase();
    } catch (e) {
        console.error('Validation error:', e.message);
        return false;
    }
}

// 🎁 ЭНДПОИНТ: Отправка подарка админу
app.post('/api/send-gift', async (req, res) => {
    try {
        const { initData, username, userId, giftValue, giftImage, time } = req.body;
                // 🔐 Валидация (рекомендуется для продакшена)
        if (initData && !validateInitData(initData, BOT_TOKEN)) {
            console.warn('❌ Invalid initData from:', username);
            return res.status(403).json({ error: 'Unauthorized', success: false });
        }
        
        // Формируем сообщение
        const message = `🎁 <b>НОВЫЙ ПОДАРОК</b>

👤 <b>Юзернейм:</b> ${username}
🆔 <b>ID:</b> <code>${userId}</code>
💎 <b>Стоимость:</b> ${giftValue} кристаллов
🕐 <b>Время:</b> ${time}

🖼 <b>Подарок:</b> <a href="${giftImage}">Смотреть изображение</a>`;
        
        // Отправляем в Telegram
        const telegramResponse = await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                chat_id: ADMIN_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            },
            { timeout: 10000 }
        );
        
        if (telegramResponse.data.ok) {
            console.log(`✅ Gift sent: ${username} (${userId}) - ${giftValue} crystals`);
            return res.status(200).json({ 
                success: true, 
                message: 'Gift notification sent',
                messageId: telegramResponse.data.result.message_id
            });
        } else {
            throw new Error('Telegram API error: ' + JSON.stringify(telegramResponse.data));
        }
        
    } catch (error) {
        console.error('❌ Send gift error:', {
            message: error.message,
            response: error.response?.data,
            code: error.code
        });
        
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to send notification',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined        });
    }
});

// 🖼️ ЭНДПОИНТ: Получение свежей аватарки
app.post('/api/get-fresh-avatar', async (req, res) => {
    try {
        const { user_id, initData } = req.body;
        
        if (!validateInitData(initData, BOT_TOKEN)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const response = await axios.get(
            `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos`,
            { params: { user_id, limit: 1 }, timeout: 5000 }
        );

        if (response.data.result.total_count > 0) {
            const fileId = response.data.result.photos[0][0].file_id;
            const fileResponse = await axios.get(
                `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
                { params: { file_id: fileId }, timeout: 5000 }
            );
            const filePath = fileResponse.data.result.file_path;
            const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
            
            return res.json({ photo_url: photoUrl });
        }
        
        return res.json({ photo_url: null });
        
    } catch (error) {
        console.error('Avatar fetch error:', error.message);
        return res.status(500).json({ error: 'Server error' });
    }
});

// 🏓 Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
});