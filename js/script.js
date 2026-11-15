document.addEventListener("DOMContentLoaded", function () {
  var burger = document.querySelector(".burger");
  var nav = document.querySelector("nav");

  if (burger && nav) {
    burger.addEventListener("click", function () {
      nav.classList.toggle("open");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
      });
    });
  }

  var mascot = document.getElementById("mascot");
  if (mascot) {
    var head = document.getElementById("mascot-head");
    var eyes = [
      { el: document.getElementById("mascot-pupil-l"), cx: 82, cy: 90 },
      { el: document.getElementById("mascot-pupil-r"), cx: 118, cy: 90 },
    ];
    var maxPupil = 3;
    var maxTilt = 6;

    var track = function (clientX, clientY) {
      var rect = mascot.getBoundingClientRect();
      var originX = rect.left + rect.width / 2;
      var originY = rect.top + rect.height / 2;
      var dx = clientX - originX;
      var dy = clientY - originY;
      var dist = Math.hypot(dx, dy) || 1;
      var nx = dx / dist;
      var ny = dy / dist;

      eyes.forEach(function (eye) {
        eye.el.setAttribute("cx", eye.cx + nx * maxPupil);
        eye.el.setAttribute("cy", eye.cy + ny * maxPupil);
      });

      var tilt = Math.max(-maxTilt, Math.min(maxTilt, dx / 40));
      head.setAttribute("transform", "rotate(" + tilt + " 100 92)");
    };

    window.addEventListener("pointermove", function (e) {
      track(e.clientX, e.clientY);
    });
  }
});
