import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'now',
        loadComponent: () => import('../now/now.page').then((m) => m.NowPage),
      },
      {
        path: 'day',
        loadComponent: () => import('../day/day.page').then((m) => m.DayPage),
      },
      {
        path: 'trends',
        loadComponent: () => import('../trends/trends.page').then((m) => m.TrendsPage),
      },
      {
        path: 'alarms',
        loadComponent: () => import('../alarms/alarms.page').then((m) => m.AlarmsPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('../settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'dashboard',
        redirectTo: '/tabs/now',
        pathMatch: 'full',
      },
      {
        path: 'chart',
        redirectTo: '/tabs/trends',
        pathMatch: 'full',
      },
      {
        path: '',
        redirectTo: '/tabs/now',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/now',
    pathMatch: 'full',
  },
];
