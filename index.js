/**
 * File first run by excuting npm start command
 */

// Import the Express module
var express = require('express');

// Import the 'path' module (packaged with Node.js)
var path = require('path');

// Create a new instance of Express
var app = express();

// Import the wikiguess game file
var wiki = require('./wikiguess');

// Create a simple Express application
app// Serve static html, js, css, and image files from the 'public' directory
    .use(express.static(path.join(__dirname,'public')))
    .use(express.static('./public'))
    .set('views', './public')
    .set('view engine', 'pug') 
    .get('/', (req, res) => {
        res.render('index')
});

// Create a Node.js based http server on port 5000
var server = require('http').createServer(app).listen(process.env.PORT || 5000);

// Create a Socket.IO server and attach it to the http server
var io = require('socket.io').listen(server);

// Listen for Socket.IO Connections. Once connected, then start the game logic.
io.sockets.on('connection', function (socket) {
    //console.log('client connected');
    wiki.initGame(io, socket,socket.handshake.address);
});


