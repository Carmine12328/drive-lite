import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { InputDialog } from './input-dialog';

describe('InputDialog', () => {
  let component: InputDialog;
  let fixture: ComponentFixture<InputDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputDialog, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Enter Name',
            label: 'Name',
            value: 'Test',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InputDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
