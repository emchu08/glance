import { test } from "node:test";
import assert from "node:assert/strict";

const { createPairing, joinPairing, pairingStatus, RELAY } = await import("@/server/relay");

test("an open phone stays present through its status checks, before any camera frame", async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    // Glasses web app first (it carries the phone's code), then the phone joins.
    const { code } = await createPairing("TSTPHN", true);
    assert.ok(await joinPairing(code, true));
    assert.equal((await pairingStatus(code, "lens"))?.phone, true);

    // Well past the presence window with no frames: the phone's own checks keep it present.
    for (let t = 0; t < 3; t += 1) {
      now += RELAY.presenceTtlMs - 1000;
      await pairingStatus(code, "phone");
    }
    const s = await pairingStatus(code, "lens");
    assert.equal(s?.phone, true, "phone counts as present");
    assert.equal(s?.frameAgeMs, null, "no frame yet, so the glasses say the camera is starting");

    // A phone that stops checking in does drop out.
    now += RELAY.presenceTtlMs + 1000;
    assert.equal((await pairingStatus(code, "lens"))?.phone, false);
  } finally {
    Date.now = realNow;
  }
});
