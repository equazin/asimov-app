# Política interna de versiones y releases

## Regla obligatoria de incremento

Asimov utiliza versiones con el formato `X.Y.Z`.

- El último parche permitido dentro de una serie es `X.Y.10`.
- Después de publicar `X.Y.10`, la siguiente versión debe ser `X.(Y+1).0`.
- No se deben crear versiones `X.Y.11`, `X.Y.12` ni superiores.

### Ejemplos

- Después de `4.25.9` corresponde `4.25.10`.
- Después de `4.25.10` corresponde `4.26.0`.
- Después de `4.26.10` corresponde `4.27.0`.

Esta regla debe aplicarse al actualizar `package.json`, `package-lock.json`, crear el tag de Git y publicar el release.
