/** Where the social card for a page is served: `/og/index.png` for the home page, `/og/<path>.png` for the rest. */
export const ogImagePath = (route) =>
  `/og${route === "/" ? "/index" : route}.png`;
