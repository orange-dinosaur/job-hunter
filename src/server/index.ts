import index from "../web/index.html";

const PORT = 4317;

const server = Bun.serve({
  port: PORT,
  routes: {
    "/*": index,
  },
  development: true,
});

// --hot reruns this file on every save but keeps globalThis, so the tab opens once per start.
const g = globalThis as { dashboardOpened?: boolean };
if (!g.dashboardOpened) {
  g.dashboardOpened = true;
  console.log(`Dashboard at ${server.url}`);
  Bun.spawn(["xdg-open", server.url.href], {
    stdout: "ignore",
    stderr: "ignore",
  });
}
