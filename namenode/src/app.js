const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

const dataNodes = [
    process.env.DATANODE_1,
    process.env.DATANODE_2,
    process.env.DATANODE_3
];

global.nodeStatus = {
    [dataNodes[0]]: 'UP',
    [dataNodes[1]]: 'UP',
    [dataNodes[2]]: 'UP'
};

const nodePrevStatus = {};
const lastSyncTrigger = {};
const SYNC_COOLDOWN_MS = 2 * 60 * 1000; // 2 phút

// khởi tạo prev map (chuẩn hoá)
for (const n of dataNodes) {
    if (!n) continue;
    const key = n.endsWith('/') ? n.slice(0, -1) : n;
    nodePrevStatus[key] = global.nodeStatus[n] || 'UNKNOWN';
}  //  LƯU TRẠNG THÁI CŨ

setInterval(async () => {
    for (let rawNode of dataNodes) {
        if (!rawNode) continue;
        const baseUrl = rawNode.endsWith('/') ? rawNode.slice(0, -1) : rawNode;
        const healthUrl = `${baseUrl}/health`;
        let current = 'DOWN';

        try {
                const resp = await axios.get(healthUrl, {
                    timeout: 5000,
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                });
                current = 'UP';

                // Lưu load từ health response
                if (resp.data && typeof resp.data.load === 'number') {
                    global.nodeLoad = global.nodeLoad || {};
                    global.nodeLoad[baseUrl] = resp.data.load;
                }
                // nếu health trả load, lưu luôn: global.nodeLoad[baseUrl] = resp.data.load || 0;
            } catch {
                current = 'DOWN';
                global.nodeLoad = global.nodeLoad || {};
                global.nodeLoad[baseUrl] = Infinity;
            }

            const prev = nodePrevStatus[baseUrl] || 'UNKNOWN';
            // Trigger only when prev was DOWN and now UP, and respect cooldown
            if (prev === 'DOWN' && current === 'UP') {
                const now = Date.now();
                if (!lastSyncTrigger[baseUrl] || (now - lastSyncTrigger[baseUrl]) > SYNC_COOLDOWN_MS) {
                    lastSyncTrigger[baseUrl] = now;
                    console.log(` Node ${baseUrl} vừa sống lại! Trigger sync...`);
                    // trigger sync logic...
                }
            }

            // update status maps
            nodePrevStatus[baseUrl] = current;
            global.nodeStatus[rawNode] = current;
            console.log(` Node ${baseUrl} is ${current}`);
    }
}, 5000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` NameNode running on port ${PORT}`);
    console.log(` Monitoring nodes:`, Object.keys(global.nodeStatus));
});