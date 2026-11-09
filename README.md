# Hexalia

Juego de colonización por turnos para 2 a 4 jugadores, en el navegador. La página es estática (`index.html`). Cada jugador tiene una cuenta (usuario y contraseña) y un rating Elo. Las partidas en línea pasan por funciones de Vercel (`api/game.js` y `api/auth.js`), que aplican las reglas en el servidor y guardan mesas y cuentas en Upstash Redis.

## Desplegar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com), pulsa **Add New → Project**, elige el repositorio y luego **Deploy**. No hay que configurar nada: no hay paso de compilación.
3. En el proyecto de Vercel, abre **Storage** y añade **Upstash Redis** (el plan gratuito sirve). Conéctalo al proyecto: Vercel añade solo las variables de entorno.
4. Abre **Deployments**, pulsa los tres puntos del último despliegue y elige **Redeploy**, para que la función lea las variables nuevas.
5. Abre la dirección del proyecto (por ejemplo `https://hexalia-tuusuario.vercel.app`), crea tu cuenta y pulsa **Crear mesa con este mapa**. Copia el enlace de invitación y pásalo a tus amigos: al abrirlo, crean su cuenta o entran y se sientan solos en la mesa.

La función acepta cualquiera de estos pares de variables:
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, o `KV_REST_API_URL` + `KV_REST_API_TOKEN`.

Cada jugador juega desde su propio dispositivo. Sin la base de datos conectada no se pueden crear mesas.

## Cómo funciona

- `index.html`: el juego completo (motor de reglas, mapa e interfaz).
- `lib/engine.js`: el motor de reglas, compartido por la página y el servidor.
- `api/auth.js`: crea cuentas, inicia y cierra sesión, y da el perfil y el ranking. Las contraseñas se guardan con scrypt y una sal por cuenta; la sesión dura 60 días.
- `api/game.js`: crea mesas, devuelve el estado y aplica jugadas. El jugador es siempre el dueño de la sesión, nunca lo que diga el navegador. Cada jugada se guarda con comparación de versión, así que dos jugadas simultáneas nunca se pisan.
- `lib/elo.js`: el rating. Todos empiezan con 1500. Al terminar una partida, cada jugador se compara con cada rival como en una partida de ajedrez (gana si quedó por encima, empata con los mismos puntos, pierde si quedó debajo), con la fórmula esperada de Elo `1 / (1 + 10^((Rrival − Rpropio) / 400))`. El cambio es `K × Σ(resultado − esperado) / (N − 1)`, con K = 40 en las primeras 30 partidas, 20 después y 10 al llegar a 2400. El ganador siempre queda 1º; el resto se ordena por puntos; quien abandona queda último.
- Si un jugador pasa 5 minutos sin jugar cuando la mesa lo espera, los demás pueden declararlo fuera y la partida sigue.
- Los jugadores ven los cambios de los demás porque la página consulta el servidor cada 1,2 segundos.
- Las mesas se borran solas tras 14 días sin jugadas.

## Modificar el juego

El código fuente está en `src/`. Después de editarlo, ejecuta `sh src/build-vercel.sh` para regenerar `index.html`, `api/` y `lib/` en la raíz.

Para probar sin Vercel ni Redis: `node src/dev/server.js` y abre `http://localhost:3000` (guarda todo en memoria).
