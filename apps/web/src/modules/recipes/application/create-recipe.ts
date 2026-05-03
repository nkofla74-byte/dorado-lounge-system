import type { RecipeRepository } from './ports/recipe-repository.port';
import type { Receta, CreateRecetaInput } from '../domain/recipe';

export async function createReceta(
  repo: RecipeRepository,
  tenantId: string,
  input: CreateRecetaInput,
): Promise<Receta> {
  return repo.create(tenantId, input);
}
