const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../env/namenode.env') });

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

setInterval(async () => {
    for (let node of dataNodes) {
        if (!node) continue;
        try {
            await axios.get(`${node}/health`, { timeout: 2000 });
            global.nodeStatus[node] = 'UP';
        } catch (error) {
            global.nodeStatus[node] = 'DOWN';
            console.log(`⚠️ Warning: Node ${node} is unreachable`);
        }
    }
}, 5000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` NameNode running on port ${PORT}`);
    console.log(` Monitoring nodes:`, Object.keys(global.nodeStatus));
});