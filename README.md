WikiGuess is a Single Page Application running on a node.js server along with Socket.IO and MongoDB

The server may be started locally by the command "npm start" which
    executes index.js

index.js calls wiki.initGame(io, socket) in wikiguess.js and sets up the webpage routing
    which in this case just sends '/' to index.pug (we use pug, a view engine)

wikiguess.js can be thought of as the server logic. It connects to the Mongo database, 
    and so contains all interactions with that database. It also binds Socket.IO
    messages from the client to functions

    These functions are split into 3 categories: 
    HOME: Actions that are accessible fromthe landing screen
    HOST: Actions exclusive to the Host in-game
    PLAYER: Actions any player may take

    In response to client emits, the server will often emit a 
        response, which contains the game state 

The game state is contained in the json gameData in wikiguess.js
    on the first level is a 4 digit code (ex. ABCD) for multiplayer Lobbies
    or the IP/socketId for single-player modes

gameData
    'CODE' (= 'ABCD')
        'code' ('ABCD')
        'gameMode' ('lobby','debug')
        'gameState' (waiting, choosing, guessing)
        'maxTime' (integer)
        'choices'
            0
                'title'
                ''
            1
            2
        'players'
            0
                'name'
                'status' ('...','Choosing','Guessed')
            1...
        'question'
        'questionNumber'
        'maxQuestions'

In app.js, updatePlayerState() and the larger updateGameState() updateGameState
    the website to update what is shown to the current gameState