import { Component, EnvironmentInjector, inject } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  triangle,
  ellipse,
  square,
  pulseOutline,
  statsChartOutline,
  remove,
  arrowDownCircle,
  arrowUpCircle,
  arrowBackCircle,
  logOutOutline,
  waterOutline,
  fitnessOutline,
  bluetoothOutline,
  hardwareChipOutline,
  warningOutline,
  settingsOutline,
  personOutline,
  saveOutline,
  informationCircleOutline,
  codeOutline,
  chevronDownOutline,
  chevronUpOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  constructor() {
    addIcons({
      triangle, ellipse, square, pulseOutline, statsChartOutline, remove,
      arrowDownCircle, arrowUpCircle, logOutOutline, arrowBackCircle,
      waterOutline, fitnessOutline, bluetoothOutline, hardwareChipOutline,
      warningOutline, settingsOutline, personOutline, saveOutline,
      informationCircleOutline, codeOutline,
      chevronDownOutline, chevronUpOutline,
    });
  }
}
