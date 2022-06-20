// @ts-check

const PI = Math.PI;
const TWO_PI = 2 * PI;

const normalizeAngle = radian => {
  while (radian < 0) radian += TWO_PI;
  return radian % TWO_PI;
}

const flipAngleX = (radian, amplifier) => {
  // console.log(radian, amplifier);
  // Amplify the bounce angle when the ball touches the paddle off center
  // TODO: Needs improvement, doesn't work as intended yet
  return normalizeAngle(PI - radian + PI/4 * amplifier);
}

const flipAngleY = radian => {
  return normalizeAngle(TWO_PI - radian);
}

// Randomize angle so it's in [-angle, angle] || [PI - angle, PI + angle] range
const initialAngle = angle => {
  return Math.random() * angle * (Math.random() > 0.5 ? -1 : 1) + (Math.random() > 0.5 ? PI : 0);
}

const clamp = (val, min, max) => {
  return Math.min(Math.max(min, val), max);
}

document.addEventListener('DOMContentLoaded', _ => {
  // DOM elements
  const dom = {
    play: document.getElementById('play'),
    table: document.getElementById('table'),
    ball: document.getElementById('ball'),
    p1: document.getElementById('p1'),
    p1Score: document.getElementById('p1-score'),
    p2: document.getElementById('p2'),
    p2Score: document.getElementById('p2-score'),
  };

  // Sound effects
  const sound = {
    play: type => {
      const audio = sound[type];
      if (audio && audio instanceof Audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.play();
      }
    }
  };
  Object.defineProperties(sound, {
    bounce: { configurable: false, writable: false, enumerable: true, value: new Audio('bounce.mp3') },
    fall: { configurable: false, writable: false, enumerable: true, value: new Audio('fall.mp3') },
  });
  for (const type in sound) if (sound.hasOwnProperty(type) && sound[type] instanceof Audio) {
    sound[type].load();
  }

  // Game session parameters
  const game = {
    on: false,
    ballSpeed: 10, // Pixel per second
    // Pixel per second.
    // If the ball starts moving at 10 pixel per second from table center to
    // the lower right corner, the computer paddle can save it by moving at
    // this speed, starting from the center right edge.
    maxP2Speed: 4.723,
    scores: {
      p1: 0,
      p2: 0,
    }
  };

  // Mouse cursor properties
  const cursor = {
    // Mouse cursor current Y coordinate within the entire page body
    y: 0,
  };

  // Table properties
  const table = {
    yMargin: undefined
  };
  Object.defineProperties(table, {
    height: { configurable: false, writable: false, value: dom.table.clientHeight },
    width: { configurable: false, writable: false, value: dom.table.clientWidth },
  });

  // Paddle properties
  const paddle = {
    p1Y: table.height / 2,
    p2Y: table.height / 2,
    // Paddles follow mouse cursor, but mouse cursor coordinates are relative
    // to the body, this offset helps convert cursor Y to paddle Y which is
    // relative to the table
    offsetY: 0,
    // Paddle movement bounds
    minY: 0, maxY: 0,
  };
  Object.defineProperties(paddle, {
    height: { configurable: false, writable: false, value: dom.p1.offsetHeight },
    width: { configurable: false, writable: false, value: dom.p1.offsetWidth },
  });

  // Ball properties
  const ball = {
    // Coordinate within the table
    x: table.width / 2,
    y: table.height / 2,
    radian: undefined,
  };
  Object.defineProperty(ball, 'radius', { configurable: false, writable: false, value: dom.ball.offsetHeight / 2 });
  Object.defineProperties(ball, {
    // Ball position confinements, it can't overlap with a paddle or table edges
    minX: { configurable: false, writable: false, value: paddle.width + ball.radius },
    maxX: { configurable: false, writable: false, value: table.width - paddle.width - ball.radius },
    minY: { configurable: false, writable: false, value: 0 + ball.radius },
    maxY: { configurable: false, writable: false, value: table.height - ball.radius },
  });

  const onResize = () => {
    // Update paddle movement bounds
    table.yMargin = (document.body.clientHeight - table.height) / 2;
    paddle.offsetY = table.yMargin;
    paddle.minY = paddle.height / 2;
    paddle.maxY = table.height - paddle.height / 2;
  }
  window.addEventListener('resize', onResize, false);
  onResize();

  document.addEventListener('mousemove', ({clientY}) => {
    // Track cursor position
    cursor.y = clientY;
  }, false);

  // Animate the ball
  const moveBall = () => {
    if (ball.radian === undefined) {
      ball.radian = initialAngle(Math.atan(table.height / table.width));
    }
    ball.x = clamp(ball.x + game.ballSpeed * Math.cos(ball.radian), ball.minX, ball.maxX);
    ball.y = clamp(ball.y + game.ballSpeed * Math.sin(ball.radian), ball.minY, ball.maxY);
    dom.ball.style.left = `${ball.x}px`;
    dom.ball.style.top = `${ball.y}px`;
  }

  // Bouncing ball at the table edge
  const bounceBallAtTableEdge = () => {
    if (ball.y <= ball.minY || ball.y >= ball.maxY) {
      ball.radian = flipAngleY(ball.radian);
      sound.play('bounce');
    }
  }

  // Bouncing ball when it hits a paddle
  const bounceBallAtPaddle = offCenterDistance => {
    if (ball.x <= ball.minX || ball.x >= ball.maxX) {
      ball.radian = flipAngleX(ball.radian, offCenterDistance);
      sound.play('bounce');
    }
  }

  // Animate player's paddle
  const moveP1 = () => {
    paddle.p1Y = clamp(cursor.y - paddle.offsetY, paddle.minY, paddle.maxY);
    dom.p1.style.top = `${paddle.p1Y}px`;
  }

  // Animate computer's paddle
  const moveP2 = () => {
    let diff = Math.min(Math.abs(ball.y - paddle.p2Y), game.maxP2Speed);
    diff *=  (ball.y < paddle.p2Y ? -1 : 1);
    paddle.p2Y = clamp(paddle.p2Y + diff, paddle.minY, paddle.maxY);
    dom.p2.style.top = `${paddle.p2Y}px`;
  }

  /**
   * Calculate the distance from paddle center to the ball's edge.
   *
   * If the ball touches the paddle, returns [player, distance], where
   * `player` is either p1 or p2, whichever's side has the ball, and
   * `distance` is a number:
   *   0, if the ball center aligns with the paddle center
   *   -1, if the ball's bottom edge touches the paddle's top edge
   *   1, if the ball's top edge touches the paddle's bottom edge
   * If the ball is about to fell off the table, abs(`distance`) > 1
   *
   * If the ball is not at a horizontal edge, returns []
   * @returns {[string, number] | []}
   */
  const paddleBallTouchDistance = () => {
    const player = ball.x <= ball.minX ? 'p1' : (ball.x >= ball.maxX ? 'p2' : null);
    if (player !== null) {
      const y = player === 'p1' ? paddle.p1Y : paddle.p2Y;
      return [player, (ball.y - y) / (paddle.height / 2 + ball.radius)];
    }
    return [];
  }

  const updateScore = losingPlayer => {
    if (losingPlayer === 'p1') {
      dom.p2Score.textContent = `${++game.scores.p2}`;
    } else {
      dom.p1Score.textContent = `${++game.scores.p1}`;
    }
  }

  const toggleGame = () => {
    if (game.on) {
      // Stop the game
      dom.play.textContent = 'Play';
    } else {
      // Start the game
      dom.play.textContent = 'Stop';
      ball.x = table.width / 2;
      ball.y = table.height / 2;
      ball.radian = undefined
    }
    // Toggle the flag at last to make sure all the preparations are done
    // before the game status is actually updated
    game.on = !game.on;
  }

  const paint = ts => {
    if (game.on) {
      moveBall();
      bounceBallAtTableEdge();
      moveP1();
      moveP2();

      const [player, pbDistance] = paddleBallTouchDistance();
      if (player) {
        if (Math.abs(pbDistance) > 1) {
          // Ball is off table
          toggleGame();
          updateScore(player);
          sound.play('fall');
        } else {
          // Ball hits a paddle
          bounceBallAtPaddle(pbDistance);
        }
      }
    }

    window.requestAnimationFrame(paint);
  }

  window.requestAnimationFrame(paint);

  dom.play.addEventListener('click', () => {
    toggleGame();
  }, false);
}, false);