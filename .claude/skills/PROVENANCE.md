# Procedencia de las Skills vendorizadas

Estas skills son **código de terceros incorporado (vendored)** al repositorio, no
dependencias instaladas. Se copian en lugar de usar submódulos para que el repo
sea reproducible sin red y sobreviva a que el upstream se borre o cambie.

| Carpeta                 | Origen                                                           | Licencia    | Commit       |
| ----------------------- | ---------------------------------------------------------------- | ----------- | ------------ |
| `apple-design*/` (8)    | https://github.com/s1gmamale1/apple-design-skills                | MIT         | `2026-05-25` |
| `apple-hig-designer/`   | https://github.com/tristan-mcinnis/apple-hig-designer-skill-2026 | MIT         | `2026-03-22` |
| `dorado-design-system/` | Propia de este proyecto                                          | Propietaria | —            |

La licencia MIT original se conserva en `LICENSE.upstream` dentro de cada
carpeta vendorizada, como exige la propia licencia.

Detalle de la auditoría previa, alternativas descartadas y procedimiento de
actualización: `docs/skills/SKILLS_INSTALLED.md`.
