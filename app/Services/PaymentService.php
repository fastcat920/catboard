<?php

namespace App\Services;


use App\Models\Payment;

class PaymentService
{
    public $method;
    protected $class;
    protected $config;
    protected $payment;

    public function __construct($method, $id = NULL, $uuid = NULL)
    {
        $this->method = $method;
        $this->class = '\\App\\Payments\\' . $this->method;
        if (!class_exists($this->class)) abort(500, __('Payment method is not available'));
        if ($id || $uuid) {
            $record = $id ? Payment::find($id) : Payment::where('uuid', $uuid)->first();
            if (!$record || $record->payment !== $method) {
                abort(422, __('Payment method is not available'));
            }
            $payment = $record->toArray();
        }
        $this->config = [];
        if (isset($payment)) {
            $this->config = $payment['config'];
            $this->config['enable'] = $payment['enable'];
            $this->config['id'] = $payment['id'];
            $this->config['uuid'] = $payment['uuid'];
            $this->config['notify_domain'] = $payment['notify_domain'];
        };
        $this->payment = new $this->class($this->config);
    }

    public function paymentId(): int
    {
        return (int) $this->config['id'];
    }

    public function notify($params)
    {
        if (!$this->config['enable']) abort(500, __('Payment method is disabled'));
        return $this->payment->notify($params);
    }

    public function pay($order, $returnUrl)
    {
        // custom notify domain name
        $notifyUrl = url("/api/v1/guest/payment/notify/{$this->method}/{$this->config['uuid']}");
        if ($this->config['notify_domain']) {
            $parseUrl = parse_url($notifyUrl);
            $notifyUrl = $this->config['notify_domain'] . $parseUrl['path'];
        }

        return $this->payment->pay([
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'trade_no' => $order['trade_no'],
            'total_amount' => $order['total_amount'],
            'user_id' => $order['user_id'],
            'stripe_token' => $order['stripe_token']
        ]);
    }

    public function form()
    {
        $form = $this->payment->form();
        $keys = array_keys($form);
        foreach ($keys as $key) {
            if (isset($this->config[$key])) $form[$key]['value'] = $this->config[$key];
        }
        return $form;
    }
}
