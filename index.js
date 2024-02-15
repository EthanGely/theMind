import express from 'express';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {Server} from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

//Status du jeu (true = running)
let gameStatus = false;

// Array des cartes ordonnées - les cartes sont supprimées quand trouvées.
let givenCards = null;

// Id des deux joueurs
let idPlayer1 = null;
let idPlayer2 = null;

// Cartes des deux joueurs - supprimées quand jouées.
let player1Cards = null;
let player2Cards = null;

// Niveau actuel (calcul des cartes)
let level = 1;

// Nombre de vies
const ViesStart = 2;
let vies = ViesStart;


// Joueurs connectés
let connectedPlayers = 0;

// Players that want to throw a star
// Array with the playerID and if they need to throw a star
let throwingStar = [];

const StarsStart = 1;
let starNumber = StarsStart;

const __dirname = dirname(fileURLToPath(import.meta.url));

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

app.get('/background.png', (req, res) => {
    res.sendFile(join(__dirname, 'background.png'));
});

app.get('/cardBackground.png', (req, res) => {
    res.sendFile(join(__dirname, 'cardBackground.png'));
});

app.get('/shuriken.png', (req, res) => {
    res.sendFile(join(__dirname, 'shuriken.png'));
});

io.on('connection', (socket) => {

    // sauvegarde du nouvel ID si une place est libre
    if (!idPlayer1) {
        // Connexion d'un nouveau joueur
        connectedPlayers++;
        idPlayer1 = socket.id;
        socket.join("players");
    } else if (!idPlayer2) {
        // Connexion d'un nouveau joueur
        connectedPlayers++;
        idPlayer2 = socket.id;
        socket.join("players");
    } else if (idPlayer1 && idPlayer2 && connectedPlayers === 2) {
        // Les deux joueurs sont déjà connectés
        // Les nouveaux arrivants seront donc des spectateurs (ayant une vision globale) //TODO
        socket.join("spectators");
        io.to("spectators").emit("updateGame", level, vies, "0", "Spectateur", [], starNumber);
    }

    // Si on a bien deux personnes connectées et enregistrées
    if (connectedPlayers >= 2 && idPlayer1 && idPlayer2) {
        // Et que la partie n'est pas encore lancée
        if (!gameStatus) {
            // on lance la partie
            startGame(true);
        }
    } else if (connectedPlayers === 1) {
        io.emit("updateGame", level, vies, "0", "En attente de joueurs<br>(1/2)", [], starNumber);
    }

    socket.on('disconnect', () => {
        // Et on supprime son ID de la liste
        if (socket.id === idPlayer1) {
            idPlayer1 = null;
            // On déconnecte l'utilisateur
            connectedPlayers--;
            endGame();
        } else if (socket.id === idPlayer2) {
            idPlayer2 = null;
            // On déconnecte l'utilisateur
            connectedPlayers--;
            endGame();
        }
    });

    // Lorsqu'un joueur envoie un nombre
    socket.on('number', (playerNumber) => {
        // Savoir si le joueur 1 ou 2 à joué.
        const isPlayer1 = socket.id === idPlayer1;

        // On récupère la bonne carte
        let nextNumber = givenCards.pop();

        // Si les deux cartes correspondent
        if (playerNumber === nextNumber) {
            // On met à jour le plateau pour les deux joueurs
            io.emit("updateGame", null, null, playerNumber, 'Partie en cours !', null, null);

            // On met à jour la main du joueur
            if (isPlayer1) {
                let index = player1Cards.indexOf(playerNumber);
                player1Cards.splice(index, 1);
                io.to(idPlayer1).emit("updateGame", null, null, null, null, player1Cards, null);
            } else {
                let index = player2Cards.indexOf(playerNumber);
                player2Cards.splice(index, 1);
                io.to(idPlayer2).emit("updateGame", null, null, null, null, player2Cards, null);
            }
        } else {
            let sizeP1before = player1Cards.length;
            let sizeP2before = player2Cards.length;

            player1Cards = player1Cards.filter((card) => card > playerNumber);
            player2Cards = player2Cards.filter((card) => card > playerNumber);
            givenCards = givenCards.filter((card) => card > playerNumber);

            vies = vies - (sizeP1before + sizeP2before - (player1Cards.length + player2Cards.length)) + 1;

            io.to(idPlayer1).emit("updateGame", null, null, null, null, player1Cards, null);
            io.to(idPlayer2).emit("updateGame", null, null, null, null, player2Cards, null);

            if (vies <= 0) {
                io.emit("updateGame", null, "0", null, "à cours de vies", [], starNumber);
                endGame();
            } else {
                io.emit("updateGame", null, vies, nextNumber, "Mauvaise carte !<br>" + nextNumber + " était attendue.", null, starNumber);
            }
        }

        nextlevel();
    });

    socket.on('star', () => {
        if (starNumber <= 0) {
            return;
        }
        // Savoir si le joueur 1 ou 2 à joué.
        const isPlayer1 = socket.id === idPlayer1;

        if (throwingStar.indexOf(socket.id) !== -1) {
            throwingStar = [];
            io.emit("waitingStar", false, false);
        } else {
            throwingStar.push(socket.id);

            if (throwingStar.length === 2 && starNumber) {
                starNumber--;
                throwingStar = [];

                let maxOfMin = Math.max(player1Cards[0], player2Cards[0]);

                player1Cards = player1Cards.filter((card) => card > maxOfMin);
                player2Cards = player2Cards.filter((card) => card > maxOfMin);
                givenCards = givenCards.filter((card) => card > maxOfMin);

                io.to(idPlayer1).emit("updateGame", null, null, null, null, player1Cards, starNumber);
                io.to(idPlayer2).emit("updateGame", null, null, null, null, player2Cards, starNumber);
                io.emit("waitingStar", false);
                nextlevel();

            } else {
                if (isPlayer1) {
                    io.to(idPlayer2).emit("waitingStar", true, false);
                    io.to(idPlayer1).emit("waitingStar", false, true);
                } else {
                    io.to(idPlayer1).emit("waitingStar", true, false);
                    io.to(idPlayer2).emit("waitingStar", false, true);
                }
            }
        }
    })

    socket.on('restart', () => {
        startGame(true);
    });
});


server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
});


function startGame(resetParameters = false) {
    //Game is On
    gameStatus = true;

    if (resetParameters) {
        //Réinitialisation des paramètres
        level = 1;
        vies = ViesStart;
        starNumber = StarsStart;
    }

    //On masque le bouton restart
    io.emit("hideRestart");
    io.emit("updateGame", level, vies, "0",  "Début de la partie !", [], starNumber);
    io.to("spectators").emit("updateGame", level, vies, "0",  "SPECTATEUR - Début de la partie !", [], starNumber);
    givenCards = [];

    while (givenCards.length < level * 2) {
        let randomNum = Math.floor(Math.random() * 100) + 1;

        if (!givenCards.includes(randomNum)) {
            givenCards.push(randomNum);
        }
    }

    givenCards.sort((a, b) => b - a);

    const shuffledArray = shuffleArray(givenCards);

    const half = Math.floor(givenCards.length / 2);
    player1Cards = shuffledArray.slice(0, half).sort((a, b) => a - b);
    player2Cards = shuffledArray.slice(half).sort((a, b) => a - b);

    io.to(idPlayer1).emit("updateGame", null, null, null, null, player1Cards, starNumber);
    io.to(idPlayer2).emit("updateGame", null, null, null, null, player2Cards, starNumber);
    io.to("spectators").emit("updateGame", null, null, null, null, givenCards, starNumber);
}

function shuffleArray(array) {
    const arrayCopy = array.slice();
    for (let i = arrayCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arrayCopy[i], arrayCopy[j]] = [arrayCopy[j], arrayCopy[i]];
    }
    return arrayCopy;
}

function nextlevel() {
    if (givenCards.length === 0 && vies > 0) {
        if (level % 3 === 0 && level < 9) {
            vies++;
        }

        if (level % 3 === 2 && level < 9) {
            starNumber++;
        }
        level++;

        io.emit("updateGame", level, vies, null, "Niveau suivant !", null, starNumber);
        io.to("spectators").emit("updateGame", level, vies, null, "SPECTATEUR - Niveau suivant !", null, starNumber);
        startGame();
    }
}

function endGame() {
    io.emit("updateGame", null, null, null, null, [], 1);
    io.to("players").emit("showRestart");
}