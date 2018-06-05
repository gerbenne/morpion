(function init() {
  const P1 = 'X';
  const P2 = 'O';
  let player;
  let game;

  const socket = io.connect('http://localhost');

  class Player {
    constructor(name, type) {
      this.name = name;
      this.type = type;
      this.currentTurn = true;
      this.playsArr = 0;
    }

    static get wins() {
      return [7, 56, 448, 73, 146, 292, 273, 84];
    }

    // Permet de définir le coup récemment joué
    updatePlaysArr(tileValue) {
      this.playsArr += tileValue;
    }

    getPlaysArr() {
      return this.playsArr;
    }

    // Réglez le tour actuel pour que le joueur tourne et mette à jour pour refléter la même chose.
    setCurrentTurn(turn) {
      this.currentTurn = turn;
      const message = turn ? 'Votre tour' : 'En attente de votre adversaire';
      $('#turn').text(message);
    }

    getPlayerName() {
      return this.name;
    }

    getPlayerType() {
      return this.type;
    }

    getCurrentTurn() {
      return this.currentTurn;
    }
  }

  // ID du salon dans laquelle le jeu tourne sur le serveur  
  class Game {
    constructor(roomId) {
      this.roomId = roomId;
      this.board = [];
      this.moves = 0;
    }

    // Créer le plateau de jeu en attachant des écouteurs d'événement aux boutons
    createGameBoard() {
      function tileClickHandler() {
        const row = parseInt(this.id.split('_')[1][0], 10);
        const col = parseInt(this.id.split('_')[1][1], 10);
        if (!player.getCurrentTurn() || !game) {
          $("#tour").modal('show');
          return;
        }

        if ($(this).prop('disabled')) {
          $("#champ").modal('show');
          return;
        }

        // Met à jour le plateau après un tour
        game.playTurn(this);
        game.updateBoard(player.getPlayerType(), row, col, this.id);

        player.setCurrentTurn(false);
        player.updatePlaysArr(1 << ((row * 3) + col));

        game.checkWinner();
      }

      for (let i = 0; i < 3; i++) {
        this.board.push(['', '', '']);
        for (let j = 0; j < 3; j++) {
          $(`#button_${i}${j}`).on('click', tileClickHandler);
        }
      }
    }
    // Supprimez le menu du DOM, affichez le plateau de jeu et accueil le joueur.
    displayBoard(message) {
      $('.menu').css('display', 'none');
      $('.gameBoard').css('display', 'block');
      $('#userHello').html(message);
      this.createGameBoard();
    }

    updateBoard(type, row, col, tile) {
      $(`#${tile}`).text(type).prop('disabled', true);
      this.board[row][col] = type;
      this.moves++;
    }

    getRoomId() {
      return this.roomId;
    }

    // Met à jour les tuiles de l'adversaire
    playTurn(tile) {
      const clickedTile = $(tile).attr('id');

      // Lorsque l'un des joueurs a fini le tour, l'autre joueur en est informé     
      socket.emit('playTurn', {
        tile: clickedTile,
        room: this.getRoomId(),
      });
    }

    checkWinner() {
      const currentPlayerPositions = player.getPlaysArr();

      Player.wins.forEach((winningPosition) => {
        if ((winningPosition & currentPlayerPositions) === winningPosition) {
          game.announceWinner();
        }
      });

      const tieMessage = 'Jeu lié';
      if (this.checkTie()) {
        socket.emit('gameEnded', {
          room: this.getRoomId(),
          message: tieMessage,
        });
        alert(tieMessage);
        location.reload();
      }
    }

    checkTie() {
      return this.moves >= 9;
    }

    /*Annonce le gagnant
    Diffuse l'annonce sur la fenêtre de l'adversaire*/
    announceWinner() {
      const message = `${player.getPlayerName()} wins!`;
      socket.emit('gameEnded', {
        room: this.getRoomId(),
        message,
      });
      alert(message);
      location.reload();
    }

    // Termine la parie si l'un des joueurs à gagné
    endGame(message) {
      alert(message);
      location.reload();
    }
  }

  // Créer un nouveau jeu
  $('#new').on('click', () => {
    const name = $('#nameNew').val();
    if (!name) {
      $("#pseudo").modal('show');
      return;
    }
    socket.emit('createGame', { name });
    player = new Player(name, P1);
  });

  // Permet de rejoindre un salon de jeu existant
  $('#join').on('click', () => {
    const name = $('#nameJoin').val();
    const roomID = $('#room').val();
    if (!name || !roomID) {
      $("#salon").modal('show');
      return;
    }
    socket.emit('joinGame', { name, room: roomID });
    player = new Player(name, P2);
  });

  // L'utilisateur ayant créé le salon de jeu reçois un message d'attente
  socket.on('newGame', (data) => {
    const message =
      `Salut, ${data.name}, veuillez demander à une autre personne de rentrer cet identifiant de jeu:
      ${data.room} ${"<br /><br />"} En attente du joueur 2 ${"<img id='gif' src='img/dot.gif'/>"} `;

    game = new Game(data.room);
    game.displayBoard(message);
  });

  /**
      Si le joueur crée le jeu, il sera P1 (X) et il commencera la partie
      Cet événement est reçu lorsque l'adversaire se connecte à la salle
   */
  socket.on('player1', (data) => {
    const message = `Salut, ${player.getPlayerName()}`;
    $('#userHello').html(message);
    player.setCurrentTurn(true);
  });

  /**
    Un utilisateur rejoint le salon, alors le joueur est P2 (O).
    Cet événement est reçu lorsque P2 rejoint avec succès le salon de jeux
   */
  socket.on('player2', (data) => {
    const message = `Salut, ${data.name}`;

    // Créer un jeu pour le joueur 2
    game = new Game(data.room);
    game.displayBoard(message);
    player.setCurrentTurn(false);
  });

   // Permet de gérer le tour en autorisant le joueur actuel à jouer maintenant
  socket.on('turnPlayed', (data) => {
    const row = data.tile.split('_')[1][0];
    const col = data.tile.split('_')[1][1];
    const opponentType = player.getPlayerType() === P1 ? P2 : P1;

    game.updateBoard(opponentType, row, col, data.tile);
    player.setCurrentTurn(true);
  });

  // Si l'autre joueur gagne, cet événement est reçu. Notifie au joueur que la partie est terminé
  socket.on('gameEnd', (data) => {
    game.endGame(data.message);
    socket.leave(data.room);
  });

//Termine le jeu sur n'importe quel événement d'erreur
  socket.on('err', (data) => {
    game.endGame(data.message);
  });
}());