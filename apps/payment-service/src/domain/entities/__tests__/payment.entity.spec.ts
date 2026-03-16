jest.mock('uuid', () => ({ v4: () => 'test-uuid-123' }));

import { Payment } from '../payment.entity';
import { PaymentStatusEnum } from '../../value-objects/payment-status.vo';
import { PaymentProviderEnum } from '../../enums/payment-provider.enum';
import { InvalidPaymentStatusTransitionError } from '../../errors/invalid-payment-status-transition.error';
import { PaymentCreatedEvent } from '../../events/payment-created.event';
import { PaymentProcessingEvent } from '../../events/payment-processing.event';
import { PaymentCompletedEvent } from '../../events/payment-completed.event';
import { PaymentFailedEvent } from '../../events/payment-failed.event';
import { PaymentRefundedEvent } from '../../events/payment-refunded.event';
import { InvalidPaymentOperationError } from '../../errors/invalid-payment-operation.error';

describe('Payment Entity', () => {
  const defaultCreateProps = {
    orderId: 'order-123',
    userId: 'user-456',
    amountInCents: 1000,
    currency: 'USD',
    provider: PaymentProviderEnum.STRIPE,
  };

  describe('Creation', () => {
    it('creates a payment in PENDING state and records a PaymentCreatedEvent', () => {
      const payment = Payment.create(defaultCreateProps);

      expect(payment.id).toBeDefined();
      expect(payment.orderId).toBe(defaultCreateProps.orderId);
      expect(payment.status.value).toBe(PaymentStatusEnum.PENDING);
      
      const events = payment.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PaymentCreatedEvent);
    });

    it('throws if amount is <= 0', () => {
      expect(() => {
        Payment.create({ ...defaultCreateProps, amountInCents: 0 });
      }).toThrow(InvalidPaymentOperationError);
    });
  });

  describe('State Machine Transitions', () => {
    let payment: Payment;

    beforeEach(() => {
      payment = Payment.create(defaultCreateProps);
      payment.pullDomainEvents(); // Clear initial event
    });

    it('PENDING -> PROCESSING', () => {
      payment.startProcessing();
      expect(payment.status.value).toBe(PaymentStatusEnum.PROCESSING);
      
      const events = payment.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PaymentProcessingEvent);
    });

    it('PROCESSING -> SUCCESS', () => {
      payment.startProcessing();
      payment.pullDomainEvents();
      
      payment.complete('tx-123');
      expect(payment.status.value).toBe(PaymentStatusEnum.SUCCESS);
      expect(payment.transactionId).toBe('tx-123');

      const events = payment.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PaymentCompletedEvent);
    });

    it('PROCESSING -> FAILED', () => {
      payment.startProcessing();
      payment.pullDomainEvents();

      payment.fail('Card declined');
      expect(payment.status.value).toBe(PaymentStatusEnum.FAILED);
      expect(payment.failReason).toBe('Card declined');

      const events = payment.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PaymentFailedEvent);
    });

    it('SUCCESS -> REFUNDED', () => {
      payment.startProcessing();
      payment.complete('tx-123');
      payment.pullDomainEvents();

      payment.refund('Customer requested');
      expect(payment.status.value).toBe(PaymentStatusEnum.REFUNDED);

      const events = payment.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(PaymentRefundedEvent);
    });

    it('prevents PENDING -> SUCCESS (invalid transition)', () => {
      expect(() => payment.complete('tx-123')).toThrow(InvalidPaymentStatusTransitionError);
    });

    it('prevents SUCCESS -> FAILED (invalid transition)', () => {
      payment.startProcessing();
      payment.complete('tx-123');
      
      expect(() => payment.fail('Card declined')).toThrow(InvalidPaymentStatusTransitionError);
    });

    it('prevents REFUNDED -> PROCESSING (invalid transition)', () => {
      payment.startProcessing();
      payment.complete('tx-123');
      payment.refund('Customer requested');
      
      expect(() => payment.startProcessing()).toThrow(InvalidPaymentStatusTransitionError);
    });
  });
});
