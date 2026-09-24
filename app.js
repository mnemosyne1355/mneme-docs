/* MNEME studio site — countdown to the next Sunday 20:00 UTC draw.
   First draw target: 2026-10-04T20:00:00Z; afterwards rolls weekly. */
(function () {
  "use strict";

  var FIRST_DRAW_MS = Date.UTC(2026, 9, 4, 20, 0, 0);
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  function nextDrawMs(nowMs) {
    if (nowMs < FIRST_DRAW_MS) return FIRST_DRAW_MS;
    var d = new Date(nowMs);
    var addDays = (7 - d.getUTCDay()) % 7; // days until Sunday
    var t = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + addDays,
      20, 0, 0
    );
    if (t <= nowMs) t += WEEK_MS;
    return t;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  var elD = document.getElementById("cd-d");
  var elH = document.getElementById("cd-h");
  var elM = document.getElementById("cd-m");
  var elS = document.getElementById("cd-s");
  if (!elD || !elH || !elM || !elS) return;

  function tick() {
    var now = Date.now();
    var diff = nextDrawMs(now) - now;
    if (diff < 0) diff = 0;
    var totalSec = Math.floor(diff / 1000);
    var days = Math.floor(totalSec / 86400);
    var hrs = Math.floor((totalSec % 86400) / 3600);
    var min = Math.floor((totalSec % 3600) / 60);
    var sec = totalSec % 60;
    elD.textContent = pad(days);
    elH.textContent = pad(hrs);
    elM.textContent = pad(min);
    elS.textContent = pad(sec);
  }

  tick();
  setInterval(tick, 1000);
})();
