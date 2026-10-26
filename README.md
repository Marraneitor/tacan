# Hexalia

Juego de colonización por turnos para 2 a 4 jugadores, en el navegador. La página es estática (`index.html`). Las partidas en línea pasan por una función de Vercel (`api/game.js`), que aplica las reglas en el servidor y guarda cada mesa en Upstash Redis.

## Desplegar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com), pulsa **Add New → Project**, elige el repositorio y luego **Deploy**. No hay que configurar nada: no hay paso de compilación.
3. En el proyecto de Vercel, abre **Storage** y añade **Upstash Redis** (el plan gratuito sirve). Conéctalo al proyecto: Vercel añade solo las variables de entorno.
4. Abre **Deployments**, pulsa los tres puntos del último despliegue y elige **Redeploy**, para que la función lea las variables nuevas.
5. Abre la dirección del proyecto (por ejemplo `https://hexalia-tuusuario.vercel.app`), escribe tu nombre y pulsa **Crear mesa en línea**. Copia el enlace de invitación y pásalo a tus amigos.

La función acepta cualquiera de estos pares de variables:
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, o `KV_REST_API_URL` + `KV_REST_API_TOKEN`.

Cada jugador juega desde su propio dispositivo. Sin la base de datos conectada no se pueden crear mesas.

## Cómo funciona

- `index.html`: el juego completo (motor de reglas, mapa e interfaz).
- `lib/engine.js`: el motor de reglas, compartido por la página y el servidor.
- `api/game.js`: crea mesas, devuelve el estado y aplica jugadas. Cada jugada se guarda con comparación de versión, así que dos jugadas simultáneas nunca se pisan.
- Los jugadores ven los cambios de los demás porque la página consulta el servidor cada 1,2 segundos.
- Las mesas se borran solas tras 14 días sin jugadas.

## Modificar el juego

El código fuente está en `src/`. Después de editarlo, ejecuta `sh src/build-vercel.sh` para regenerar `index.html`, `lib/engine.js` y `api/game.js` en la raíz.
