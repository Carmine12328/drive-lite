import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UploadDialog } from './upload-dialog';

describe('UploadDialog', () => {
  let component: UploadDialog;
  let fixture: ComponentFixture<UploadDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadDialog, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            folderId: 'ROOT',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
