import type { RecipeRepository } from './ports/recipe-repository.port';
import type { RecetaIngrediente, AddIngredienteInput } from '../domain/recipe';

export async function addIngrediente(
  repo: RecipeRepository,
  tenantId: string,
  input: AddIngredienteInput,
): Promise<RecetaIngrediente> {
  return repo.addIngrediente(tenantId, input);
}
