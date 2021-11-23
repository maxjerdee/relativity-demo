/**
 * File first run by excuting npm start command
 */

// Import the Express module
import express from 'express';
import http from 'http';
import SocketIo from 'socket.io';

// Create a new instance of Express
const app = express();
const port = process.env.PORT || 5000; 

// Import the wikiguess game file
// eslint-disable-next-line @typescript-eslint/no-var-requires
//const wiki = require('./wikiguess');

// Create a simple Express application
app// Serve static html, js, css, and image files from the 'public' directory
    .use(express.static('./public'))
    .set('views', './public')
    .set('view engine', 'ejs') 
    .get('/', (req, res) => {
        res.render('accel');
});

// Create a Node.js based http server on port 5000
const server = http.createServer(app).listen(port, 
    () => console.log(`Listening on port: ${port}`));

// Create a Socket.IO server and attach it to the http server
const io = SocketIo.listen(server);

// Listen for Socket.IO Connections. Once connected, then start the game logic.
io.sockets.on('connection', function (socket) {
    console.log('client connected');
    //wikiGuess.initGame(socket, socket.handshake.address);
});