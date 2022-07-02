import { start } from "worktop/cfw";
import { createRouter } from "./router";

const router = createRouter();

export default start(router.run);
