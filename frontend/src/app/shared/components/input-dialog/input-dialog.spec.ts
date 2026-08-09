import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InputDialog } from './input-dialog';

describe('InputDialog', () => {
  let component: InputDialog;
  let fixture: ComponentFixture<InputDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(InputDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
