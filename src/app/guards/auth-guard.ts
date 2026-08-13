import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError, map, of } from 'rxjs';

export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  const token = authService.getToken();

  if (!token) {
    router.navigate(['/login'], {
      queryParams: {
        returnUrl: state.url
      }
    });

    return false;
  }

  return authService.refreshCurrentUser().pipe(
    map(() => {
      const permission = route.data['permission'] as string | undefined;
      const permissions = route.data['permissions'] as string[] | undefined;

      if (permission && !authService.hasPermission(permission)) {
        return router.createUrlTree(['/forbidden']);
      }

      if (permissions?.length && !authService.hasAnyPermission(permissions)) {
        return router.createUrlTree(['/forbidden']);
      }

      return true;
    }),
    catchError(() => {
      authService.logout();
      return of(router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }));
    })
  );
};
