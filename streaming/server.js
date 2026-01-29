const NodeMediaServer = require('node-media-server');

const config = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 8888,
        allow_origin: '*',
        mediaroot: './media',
    }
};

var nms = new NodeMediaServer(config);
nms.run();

console.log('===================================================');
console.log('🏁 SERVIDOR DE STREAMING LOCAL INICIADO');
console.log('===================================================');
console.log('📡 Configuración para OBS:');
console.log('   Servidor: rtmp://<IP_DE_ESTE_PC>/live');
console.log('   Clave: station1 (o station2, station3...)');
console.log('---------------------------------------------------');
console.log('📺 URL para el navegador (Frontend):');
console.log('   http://<IP_DE_ESTE_PC>:8888/live/station1.flv');
console.log('===================================================');
