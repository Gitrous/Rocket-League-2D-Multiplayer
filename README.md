# Turbo Fútbol 2D

Fútbol con coches en 2D para el navegador: saltos, doble salto con voltereta, turbo y paredes curvas.
Se puede jugar contra la IA, a dos en el mismo teclado u **online, cada uno desde su casa**.

## Modos

| Modo | Cómo funciona |
|---|---|
| **1 jugador** | Contra la IA. Eliges tu coche en el garaje y pulsas «¡Listo!». |
| **2 jugadores** | Los dos en el mismo teclado. Cada uno pulsa «¡Listo!» en su lado del garaje. |
| **Online** | Uno **crea una sala** y recibe un código de 4 letras; el otro **se une** con ese código. Los dos entráis al **garaje**, veis en directo el coche del otro, y cuando **los dos** pulsáis «¡Listo!» empieza la partida. Al terminar, «Revancha» os devuelve a los dos al garaje. |

## Controles

| Acción | Jugador 1 (y online) | Jugador 2 (y online) |
|---|---|---|
| Mover / girar en el aire | A / D | ← / → |
| Saltar (dos veces = doble salto; con dirección = voltereta) | W | ↑ |
| Turbo | Espacio o Shift izq. | Enter, Shift der. o Numpad 0 |
| Frenar | S | ↓ |
| Salir de la partida | Esc | Esc |

Reglas: partidos de 3 minutos; si hay empate, prórroga con gol de oro.

## Ponerlo en marcha

Necesitas [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm start
```

Abre <http://localhost:3000>. Otros puertos: `PORT=8080 npm start`.

## Jugar online desde casas distintas

El servidor (`npm start`) tiene que estar en un sitio al que lleguen los dos jugadores. Opciones:

1. **Misma red wifi**: el que ejecuta `npm start` comparte su IP local, por ejemplo `http://192.168.1.20:3000`.
2. **Túnel rápido desde tu ordenador** (sin tocar el router):
   ```bash
   npx cloudflared tunnel --url http://localhost:3000
   ```
   Te da una dirección `https://….trycloudflare.com` que puedes enviar a tu amigo.
3. **Publicarlo en internet** en un servicio que ejecute Node.js y admita WebSockets (Render, Railway, Fly.io…):
   comando de inicio `npm start`; el puerto lo toma de la variable `PORT`.

Los dos abrís esa misma dirección, vais a **Online**, uno crea la sala y el otro se une con el código.

## Cómo está hecho

```
shared/   config.js  constantes, opciones del garaje y validación
          game.js    simulación de la partida (física con planck.js / Box2D)
          ai.js      IA del modo 1 jugador
server/   index.js   servidor HTTP + WebSocket (/ws)
          rooms.js   salas: crear, unirse, garaje, listos, partida, revancha
client/   index.html pantallas (carga, menú, online, sala, garaje, resultado)
          main.js    flujo del juego, bucle local y online
          render.js  dibujo del estadio, coches, pelota, partículas y marcador
          input.js   teclado · audio.js sonidos sintetizados · net.js conexión
test/     pruebas de la simulación y del flujo online completo
```

- La **misma simulación** se usa en local (en el navegador) y online (en el servidor).
- Online, el **servidor es la autoridad**: recibe los controles de cada jugador, simula la partida
  a 60 Hz y envía el estado 30 veces por segundo. Los clientes interpolan (~80 ms) para que el
  movimiento sea suave, así que nadie puede hacer trampas modificando su navegador.
- Gráficos y sonidos son propios: se dibujan con canvas y se sintetizan con Web Audio.

## Pruebas

```bash
npm test
```

Para probar partidas cortas: `MATCH_DURATION=20 npm start` (segundos por partido online).
