import type { RecipeRepository } from './ports/recipe-repository.port';
import type { RecetaWithIngredientes } from '../domain/recipe';

export async function getRecetas(
  repo: RecipeRepository,
  tenantId: string,
): Promise<RecetaWithIngredientes[]> {
  return repo.findAll(tenantId);
}
