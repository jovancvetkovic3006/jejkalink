import { Component } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
} from '@ionic/angular/standalone';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { HttpService } from '../services/http.service';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [IonButton, IonHeader, IonToolbar, IonTitle, IonContent],
})
export class Tab1Page {
  constructor(private readonly http: HttpService) {}

  test() {
    this.http.getDiscoverInfo();
    // console.log('XXXXXXXXXXXXXXXXXXXX TESTER');
  }
}
