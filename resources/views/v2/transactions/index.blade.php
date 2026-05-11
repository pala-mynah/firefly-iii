@extends('layout.v2')
@section('scripts')
    @vite(['src/pages/transactions/index.js'])
@endsection
@section('content')
    <div class="app-content">
        <div class="container-fluid" x-data="index">
            <x-messages></x-messages>

            {{-- Top summary cards --}}
            <div class="row mb-3">
                <div class="col-xl-4 col-lg-6 col-md-12 mb-3">
                    <div class="card h-100">
                        <div class="card-header">
                            <h3 class="card-title">{{ $subTitle }}</h3>
                        </div>
                        <div class="card-body p-0">
                            <table class="table table-sm mb-0">
                                <tbody>
                                    <tr>
                                        <th>{{ __('firefly.transactions') }}</th>
                                        <td class="text-end">{{ $groups->total() }}</td>
                                    </tr>
                                    <tr>
                                        <th>{{ __('firefly.start') }}</th>
                                        <td class="text-end text-muted">{{ $start->isoFormat('D MMM YYYY') }}</td>
                                    </tr>
                                    <tr>
                                        <th>{{ __('firefly.end') }}</th>
                                        <td class="text-end text-muted">{{ $end->isoFormat('D MMM YYYY') }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-6 col-md-12 mb-3">
                    <div class="card h-100">
                        <div class="card-header">
                            <h3 class="card-title">{{ __('firefly.actions') }}</h3>
                        </div>
                        <div class="card-body d-flex flex-column gap-2">
                            @if('all' !== $objectType)
                                <a href="{{ route('transactions.create', [$objectType]) }}"
                                   class="btn btn-success btn-sm">
                                    <em class="fa-solid fa-plus fa-fw"></em>
                                    {{ __('firefly.create_new_' . $objectType) }}
                                </a>
                            @endif
                            @if(count($periods) > 0)
                                <a href="{{ route('transactions.index.all', [$objectType]) }}"
                                   class="btn btn-outline-secondary btn-sm">
                                    <em class="fa-solid fa-calendar fa-fw"></em>
                                    {{ __('firefly.show_all_no_filter') }}
                                </a>
                            @else
                                <a href="{{ route('transactions.index', [$objectType]) }}"
                                   class="btn btn-outline-secondary btn-sm">
                                    <em class="fa-solid fa-calendar fa-fw"></em>
                                    {{ __('firefly.show_the_current_period_and_overview') }}
                                </a>
                            @endif
                        </div>
                    </div>
                </div>
                <div class="col-xl-4 col-lg-6 col-md-12 mb-3">
                    <div class="card h-100">
                        <div class="card-header">
                            <h3 class="card-title">{{ __('firefly.other_budgets') }}</h3>
                        </div>
                        <div class="card-body d-flex flex-column gap-2">
                            @if('withdrawal' !== $objectType)
                                <a href="{{ route('transactions.index', ['withdrawal']) }}"
                                   class="btn btn-outline-secondary btn-sm">
                                    <em class="fa-solid fa-arrow-left fa-fw text-danger"></em>
                                    {{ __('firefly.withdrawals') }}
                                </a>
                            @endif
                            @if('deposit' !== $objectType)
                                <a href="{{ route('transactions.index', ['deposit']) }}"
                                   class="btn btn-outline-secondary btn-sm">
                                    <em class="fa-solid fa-arrow-right fa-fw text-success"></em>
                                    {{ __('firefly.deposits') }}
                                </a>
                            @endif
                            @if('transfer' !== $objectType)
                                <a href="{{ route('transactions.index', ['transfer']) }}"
                                    class="btn btn-outline-secondary btn-sm">
                                    <em class="fa-solid fa-rotate fa-fw text-info"></em>
                                    {{ __('firefly.transfers') }}
                                </a>
                            @endif
                        </div>
                    </div>
                </div>
            </div>

            {{-- Transaction list + sidebar --}}
            <div class="row mb-3">
                {{-- Transaction table --}}
                <div class="col-xl-10 col-lg-12 col-md-12">
                    <template x-if="!notifications.wait.show">
                        <nav aria-label="{{ __('firefly.paginateNext') }}">
                            <ul class="pagination pagination-sm">
                                <template x-if="page > 1">
                                    <li class="page-item">
                                        <a class="page-link" @click.prevent="previousPage" href="#">&laquo;</a>
                                    </li>
                                </template>
                                <template x-for="i in totalPages">
                                    <li :class="{'page-item': true, 'active': i === page}">
                                        <a class="page-link" href="#" x-text="i" @click.prevent="gotoPage(i)"></a>
                                    </li>
                                </template>
                                <template x-if="page < totalPages">
                                    <li class="page-item">
                                        <a class="page-link" @click.prevent="nextPage" href="#">&raquo;</a>
                                    </li>
                                </template>
                            </ul>
                        </nav>
                    </template>

                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">{{ __('firefly.transactions') }}</h3>
                        </div>
                        <div class="card-body p-0">
                            <template x-if="notifications.wait.show">
                                <div class="text-center py-4 text-muted">
                                    <em class="fa-solid fa-spinner fa-spin fa-fw"></em>
                                    <span x-text="notifications.wait.text"></span>
                                </div>
                            </template>
                            <template x-if="notifications.error.show">
                                <div class="alert alert-danger m-2" x-text="notifications.error.text"></div>
                            </template>
                            <table class="table table-sm table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th style="width:1.5rem"></th>
                                        <th>{{ __('list.description') }}</th>
                                        <th>{{ __('list.source_account') }}</th>
                                        <th>{{ __('list.destination_account') }}</th>
                                        <th class="text-end">{{ __('list.amount') }}</th>
                                        <th>{{ __('list.date') }}</th>
                                        <th>{{ __('list.category') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                <template x-for="transaction in transactions" :key="transaction.transaction_journal_id">
                                    <tr>
                                        <td class="text-center">
                                            <template x-if="'withdrawal' === transaction.type">
                                                <em class="fa-solid fa-arrow-left text-danger"></em>
                                            </template>
                                            <template x-if="'deposit' === transaction.type">
                                                <em class="fa-solid fa-arrow-right text-success"></em>
                                            </template>
                                            <template x-if="'transfer' === transaction.type">
                                                <em class="fa-solid fa-rotate text-info"></em>
                                            </template>
                                            <template x-if="'withdrawal' !== transaction.type && 'deposit' !== transaction.type && 'transfer' !== transaction.type">
                                                <em class="fa-solid fa-circle-dot text-muted"></em>
                                            </template>
                                        </td>
                                        <td>
                                            <a :href="'./transactions/show/' + transaction.id"
                                               x-text="transaction.description"></a>
                                        </td>
                                        <td>
                                            <a :href="'./accounts/show/' + transaction.source_id"
                                               x-text="transaction.source_name"></a>
                                        </td>
                                        <td>
                                            <a :href="'./accounts/show/' + transaction.destination_id"
                                               x-text="transaction.destination_name"></a>
                                        </td>
                                        <td class="text-end text-nowrap">
                                            <template x-if="'withdrawal' === transaction.type">
                                                <span class="text-danger"
                                                      x-text="formatMoney(transaction.amount * -1, transaction.currency_code)"></span>
                                            </template>
                                            <template x-if="'deposit' === transaction.type">
                                                <span class="text-success"
                                                      x-text="formatMoney(transaction.amount, transaction.currency_code)"></span>
                                            </template>
                                            <template x-if="'transfer' === transaction.type">
                                                <span class="text-info"
                                                      x-text="formatMoney(transaction.amount, transaction.currency_code)"></span>
                                            </template>
                                            <template x-if="'withdrawal' !== transaction.type && 'deposit' !== transaction.type && 'transfer' !== transaction.type">
                                                <span x-text="formatMoney(transaction.amount, transaction.currency_code)"></span>
                                            </template>
                                        </td>
                                        <td class="text-nowrap" x-text="format(transaction.date)"></td>
                                        <td x-text="transaction.category_name ?? ''"></td>
                                    </tr>
                                </template>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {{-- Period sidebar --}}
                <div class="col-xl-2 col-lg-12 col-md-12">
                    @if(count($periods) > 0)
                        @foreach($periods as $period)
                            <div class="card mb-2">
                                <div class="card-header py-2">
                                    <h6 class="card-title mb-0">
                                        <a href="{{ $period['route'] }}">{{ $period['title'] }}</a>
                                    </h6>
                                </div>
                                @if($period['total_transactions'] > 0)
                                    <div class="card-body p-0">
                                        <table class="table table-sm mb-0">
                                            <tbody>
                                                <tr>
                                                    <td class="text-muted small">{{ __('firefly.count_transactions') }}</td>
                                                    <td class="text-end small">{{ $period['total_transactions'] }}</td>
                                                </tr>
                                                @foreach($period['spent'] ?? [] as $entry)
                                                    @if(is_array($entry) && (float)$entry['amount'] !== 0.0)
                                                        <tr>
                                                            <td class="text-muted small">{{ __('firefly.spent') }}</td>
                                                            <td class="text-end small text-danger">
                                                                {{ $entry['currency_symbol'] }}{{ number_format(abs((float)$entry['amount']), $entry['currency_decimal_places']) }}
                                                            </td>
                                                        </tr>
                                                    @endif
                                                @endforeach
                                                @foreach($period['earned'] ?? [] as $entry)
                                                    @if(is_array($entry) && (float)$entry['amount'] !== 0.0)
                                                        <tr>
                                                            <td class="text-muted small">{{ __('firefly.earned') }}</td>
                                                            <td class="text-end small text-success">
                                                                {{ $entry['currency_symbol'] }}{{ number_format(abs((float)$entry['amount']), $entry['currency_decimal_places']) }}
                                                            </td>
                                                        </tr>
                                                    @endif
                                                @endforeach
                                                @foreach($period['transferred'] ?? [] as $entry)
                                                    @if(is_array($entry) && (float)$entry['amount'] !== 0.0)
                                                        <tr>
                                                            <td class="text-muted small">{{ __('firefly.transferred') }}</td>
                                                            <td class="text-end small text-info">
                                                                {{ $entry['currency_symbol'] }}{{ number_format(abs((float)$entry['amount']), $entry['currency_decimal_places']) }}
                                                            </td>
                                                        </tr>
                                                    @endif
                                                @endforeach
                                            </tbody>
                                        </table>
                                    </div>
                                @endif
                            </div>
                        @endforeach
                    @endif
                </div>
            </div>

        </div>
    </div>
@endsection
