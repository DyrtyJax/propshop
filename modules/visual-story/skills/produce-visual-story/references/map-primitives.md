# Map primitives

Maps communicate claims. Keep the geographic data inspectable and the visual treatment replaceable.

## Suggested element data

- `map.route`: `coordinates`, optional `stops`, `direction`, and `measure`
- `map.marker`: `coordinate`, optional `label`, `value`, and `category`
- `map.label`: `coordinate`, `text`, optional `priority` and `anchor`
- `map.region`: GeoJSON `geometry`, optional `value`, `category`, and `label`
- `map.flow`: `origin`, `destination`, optional `value`, `direction`, and `arc`
- `map.camera`: `center`, `zoom`, optional `bearing`, `pitch`, and `bounds`

Coordinates should be `[longitude, latitude]`. Store a CRS declaration when the source is not WGS84.

## Cartographic checks

- Record the data source, vintage, license, and transformation history.
- Pick a projection consciously. A familiar projection is not automatically an honest one.
- Match apparent precision to source precision; do not imply exact routes from coarse data.
- Keep required attribution visible at the destination's actual size.
- Test label collisions, contrast, color-blind distinctions, and reduced-motion behavior.
- Explain or annotate geographic simplification that changes the visual claim.
- Verify camera moves do not disorient or hide the relationship being explained.

For lightweight editorial boards, an equirectangular sketch is acceptable if it is clearly labeled as a preview. Use a real map renderer or geographic projection for production claims.
