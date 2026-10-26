#!/bin/sh
cd "$(dirname "$0")"
{
  echo '<title>Hexalia</title>'
  echo '<meta name="claude:viewport-fit-sides" content="cover">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&family=Young+Serif&display=swap">'
  echo '<style>'; cat style.css; echo '</style>'
  echo '<div id="app"></div>'
  echo '<script>'; cat engine.js; echo '</script>'
  echo '<script>'; cat board.js; echo '</script>'
  echo '<script>'; cat ui.js; echo '</script>'
} > hexalia.html
