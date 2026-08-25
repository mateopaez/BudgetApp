import { ActivatedRoute, Router } from '@angular/router';

export type OneShotQueryParam = 'action' | 'import';

export function oneShotQueryCleanup(
  keys: readonly OneShotQueryParam[]
): Partial<Record<OneShotQueryParam, null>> {
  return keys.reduce(
    (params, key) => {
      params[key] = null;
      return params;
    },
    {} as Partial<Record<OneShotQueryParam, null>>
  );
}

export function clearOneShotQueryParams(
  router: Router,
  route: ActivatedRoute,
  keys: readonly OneShotQueryParam[]
): Promise<boolean> {
  const queryParams = oneShotQueryCleanup(keys);
  return router.navigate([], {
    relativeTo: route,
    queryParams,
    queryParamsHandling: 'merge',
    replaceUrl: true,
  });
}
